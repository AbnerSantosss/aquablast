"use server";

import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { createAdminSession, destroyAdminSession, getAdminSession } from "@/lib/auth/session";
import {
  consumePasswordResetToken,
  getPasswordResetTarget,
  isPasswordResetTokenFormat,
  issuePasswordResetToken,
  passwordResetUrl,
} from "@/lib/auth/password-reset";
import { ensureBootstrap } from "@/lib/bootstrap";
import { sendAdminPasswordResetEmail } from "@/lib/email/send";
import { errorMessage, log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { bool, str } from "@/lib/admin/form";
import { audit } from "@/lib/admin/audit";
import {
  FORGOT_PASSWORD_SENT_MESSAGE,
  LOGIN_GENERIC_MESSAGE,
  RESET_LINK_INVALID_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
  fieldErrors,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "@/lib/admin/schemas/auth";
import { fail, ok, type ActionResult } from "@/lib/admin/types";

/*
 * Arquivo "use server": todo export é um endpoint público. Só as actions ficam exportadas;
 * helpers de token estão em src/lib/auth/password-reset.ts.
 */

const GENERIC = LOGIN_GENERIC_MESSAGE;

/** Só aceita destinos internos do painel (evita open redirect). */
function safeNext(raw: string): string {
  if (raw.startsWith("/admin") && !raw.startsWith("//") && !raw.includes("://") && !raw.startsWith("/admin/login")) return raw;
  return "/admin";
}

/** Valor cru do FormData (o schema faz trim e confere o tamanho, sem cortar em silêncio). */
function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

export async function login(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await ensureBootstrap();
  // str() como sempre (trim + limite) para a senha continuar batendo com os hashes já gravados.
  const parsed = loginSchema.safeParse({
    email: str(formData, "email", 254),
    password: str(formData, "password", 200),
    remember: bool(formData, "remember"),
  });
  const next = safeNext(str(formData, "next", 500));
  if (!parsed.success) return fail(GENERIC);
  const { email, password } = parsed.data;
  const remember = parsed.data.remember === true;

  const ip = clientIp(await headers());
  const rl = await rateLimit(`login:${ip}:${email}`, 5, 15 * 60);
  if (!rl.allowed) {
    return fail(`Muitas tentativas. Tente novamente em ${Math.ceil(rl.retryAfterSeconds / 60)} min.`, { code: "rate_limited" });
  }

  const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
  // Compara mesmo sem usuário para não vazar existência pelo tempo de resposta.
  const okPass = await compare(password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid");
  if (!user || !okPass || user.disabledAt) return fail(GENERIC);

  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  await createAdminSession({ id: user.id, email: user.email, name: user.name }, { remember });
  await audit(`admin:${user.email}`, "auth.login", { type: "admin_user", id: user.id }, { ip, remember });
  redirect(next);
}

export async function logout(): Promise<void> {
  const s = await getAdminSession();
  if (s) await audit(`admin:${s.email}`, "auth.logout", { type: "admin_user", id: s.sub });
  await destroyAdminSession();
  redirect("/admin/login");
}

/**
 * Trabalho que depende da conta no "Esqueci minha senha". Roda dentro de after(), depois da
 * resposta, para que nem o tempo das escritas no banco revele se o e-mail existe.
 * Nada aqui pode registrar o token ou o link.
 */
async function processPasswordResetRequest(email: string, ip: string): Promise<void> {
  const user = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.email, email),
    columns: { id: true, email: true, disabledAt: true },
  });
  if (!user || user.disabledAt) return;
  const token = await issuePasswordResetToken(user.id, ip);
  await audit("system:password-reset", "auth.password.reset_requested", { type: "admin_user", id: user.id }, { ip });
  const sent = await sendAdminPasswordResetEmail(user.email, passwordResetUrl(token));
  if (!sent.ok) log.error("admin password reset email failed", { adminUserId: user.id, error: sent.error ?? sent.skipped });
}

/**
 * "Esqueci minha senha". Campo: `email`. Sempre devolve a mesma resposta (ok + FORGOT_PASSWORD_SENT_MESSAGE),
 * exista a conta ou não. E-mail inválido: fail com `fields.email`. Limite: 5/15 min por IP e 3/60 min por e-mail.
 */
export async function requestPasswordReset(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await ensureBootstrap();
  const ip = clientIp(await headers());
  const byIp = await rateLimit(`pwreset:ip:${ip}`, 5, 15 * 60);
  if (!byIp.allowed) return fail(TOO_MANY_ATTEMPTS_MESSAGE, { code: "rate_limited" });

  const parsed = forgotPasswordSchema.safeParse({ email: field(formData, "email") });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Informe um e-mail válido.", { fields: fieldErrors(parsed.error) });
  }
  const { email } = parsed.data;

  const byEmail = await rateLimit(`pwreset:email:${email}`, 3, 60 * 60);
  if (!byEmail.allowed) return fail(TOO_MANY_ATTEMPTS_MESSAGE, { code: "rate_limited" });

  after(async () => {
    try {
      await processPasswordResetRequest(email, ip);
    } catch (err) {
      log.error("admin password reset request failed", { error: errorMessage(err) });
    }
  });
  return ok(FORGOT_PASSWORD_SENT_MESSAGE);
}

/**
 * Criar a nova senha pelo link. Campos: `token` (hidden), `password`, `confirmPassword`
 * (o `username` oculto do gerenciador de senhas é ignorado). Limite: 10/15 min por IP.
 * Sucesso: não loga ninguém; apaga o cookie deste navegador e redireciona para /admin/login?redefinida=1.
 */
export async function resetPassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await ensureBootstrap();
  const ip = clientIp(await headers());
  const rl = await rateLimit(`pwreset-apply:ip:${ip}`, 10, 15 * 60);
  if (!rl.allowed) return fail(TOO_MANY_ATTEMPTS_MESSAGE, { code: "rate_limited" });

  const token = formData.get("token");
  if (!isPasswordResetTokenFormat(token)) return fail(RESET_LINK_INVALID_MESSAGE, { code: "invalid_token" });

  const parsed = resetPasswordSchema.safeParse({
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Confira os campos.", { fields: fieldErrors(parsed.error) });
  }

  // Pré-checagem barata para não gastar bcrypt com link morto; quem decide é o consumo atômico abaixo.
  if (!(await getPasswordResetTarget(token))) return fail(RESET_LINK_INVALID_MESSAGE, { code: "invalid_token" });

  const passwordHash = await hash(parsed.data.password, 12);
  const user = await consumePasswordResetToken(token, passwordHash);
  if (!user) return fail(RESET_LINK_INVALID_MESSAGE, { code: "invalid_token" });

  await audit(`admin:${user.email}`, "auth.password.reset", { type: "admin_user", id: user.id }, { ip });
  await destroyAdminSession();
  redirect("/admin/login?redefinida=1");
}
