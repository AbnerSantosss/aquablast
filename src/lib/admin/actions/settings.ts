"use server";

import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { invalidateOpenPasswordResets } from "@/lib/auth/password-reset";
import { createAdminSession, requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { sendTestEmail } from "@/lib/email/send";
import { isSecretKey, setSetting, type SettingKey, type SettingsMap } from "@/lib/settings";
import { getStoredSupportWhatsapp } from "@/lib/site/support-contact";
import { CARRIERS } from "@/lib/tracking/provider";
import { actorOf, audit } from "@/lib/admin/audit";
import { bool, int, isEmail, parseFieldMap, str } from "@/lib/admin/form";
import { changePasswordSchema, fieldErrors } from "@/lib/admin/schemas/auth";
import { fail, ok, type ActionResult } from "@/lib/admin/types";

type Patch = Partial<SettingsMap>;

/** Grava as chaves informadas. Segredos vazios são ignorados (= manter o atual). */
async function apply(actor: string, section: string, patch: Patch): Promise<string[]> {
  const changed: string[] = [];
  for (const [k, v] of Object.entries(patch) as [SettingKey, SettingsMap[SettingKey]][]) {
    if (isSecretKey(k) && (v === "" || v === undefined || v === null)) continue;
    await setSetting(k, v as never, actor);
    changed.push(k);
  }
  await audit(actor, "settings.update", { type: "settings", id: section }, { keys: changed });
  revalidatePath("/admin/configuracoes");
  return changed;
}

async function begin() {
  const session = await requireAdmin();
  await ensureBootstrap();
  return { session, actor: actorOf(session) };
}

export async function saveStoreSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const name = str(fd, "store.name", 100);
  if (!name) return fail("Informe o nome da loja.");
  const supportEmail = str(fd, "store.supportEmail", 254);
  if (supportEmail && !isEmail(supportEmail)) return fail("E-mail de suporte inválido.");
  const tracking = str(fd, "store.trackingPageUrl", 500) || "/rastrear";
  if (!tracking.startsWith("/") && !/^https?:\/\//i.test(tracking)) return fail("A página de rastreio deve começar com / ou http(s)://");
  const whatsapp = str(fd, "store.supportWhatsapp", 30).replace(/\D/g, "");
  if (whatsapp && !/^\d{10,15}$/.test(whatsapp)) return fail("WhatsApp de suporte: use só números, com DDI e DDD (ex.: 5581999999999).");
  const patch: Patch = {
    "store.name": name,
    "store.supportEmail": supportEmail,
    "store.trackingPageUrl": tracking,
  };
  // Campo vazio e nenhuma linha gravada: não grava a chave, para os e-mails seguirem
  // exatamente como antes. Com linha gravada, vazio = o dono apagou (grava "").
  if (whatsapp || (await getStoredSupportWhatsapp()).exists) patch["store.supportWhatsapp"] = whatsapp;
  await apply(actor, "store", patch);
  // Home e /trocas-e-devolucoes mostram o WhatsApp (ISR): refletem na próxima visita.
  revalidatePath("/");
  revalidatePath("/trocas-e-devolucoes");
  return ok("Dados da loja salvos.");
}

export async function saveEmailSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const provider = str(fd, "email.provider", 20);
  if (provider !== "smtp" && provider !== "resend" && provider !== "brevo") return fail("Provedor inválido.");
  const from = str(fd, "email.from.address", 254);
  if (from && !isEmail(from)) return fail("E-mail remetente inválido.");
  const replyTo = str(fd, "email.replyTo", 254);
  if (replyTo && !isEmail(replyTo)) return fail("E-mail de resposta inválido.");
  const patch: Patch = {
    "email.provider": provider,
    "email.from.name": str(fd, "email.from.name", 100) || "AquaBlast",
    "email.from.address": from,
    "email.replyTo": replyTo,
  };
  if (provider === "smtp") {
    patch["email.smtp.host"] = str(fd, "email.smtp.host", 200);
    patch["email.smtp.port"] = int(fd, "email.smtp.port", 465, 1, 65535);
    patch["email.smtp.secure"] = bool(fd, "email.smtp.secure");
    patch["email.smtp.user"] = str(fd, "email.smtp.user", 254);
    patch["email.smtp.pass"] = str(fd, "email.smtp.pass", 500);
  } else if (provider === "resend") {
    patch["email.resend.apiKey"] = str(fd, "email.resend.apiKey", 500);
  } else {
    patch["email.brevo.apiKey"] = str(fd, "email.brevo.apiKey", 500);
  }
  await apply(actor, "email", patch);
  return ok("Configurações de e-mail salvas. Segredos em branco foram mantidos.");
}

export async function savePixReminderSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  await apply(actor, "pixReminder", {
    "email.pixReminder.afterMinutes": int(fd, "email.pixReminder.afterMinutes", 60, 0, 60 * 24 * 30),
    "email.pixReminder.maxCount": int(fd, "email.pixReminder.maxCount", 2, 0, 20),
  });
  return ok("Lembrete de Pix salvo.");
}

export async function saveTrackingSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const provider = str(fd, "tracking.provider", 20);
  if (provider !== "17track" && provider !== "manual") return fail("Provedor inválido.");
  const carrier = Number(str(fd, "tracking.17track.defaultCarrier", 20));
  await apply(actor, "tracking", {
    "tracking.provider": provider,
    "tracking.17track.apiKey": str(fd, "tracking.17track.apiKey", 500),
    "tracking.17track.defaultCarrier": CARRIERS.some((c) => c.code === carrier) ? carrier : 101332,
    "tracking.syncIntervalMinutes": int(fd, "tracking.syncIntervalMinutes", 60, 5, 60 * 24),
  });
  return ok("Configurações de rastreio salvas.");
}

export async function saveCheckoutSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const { map, error } = parseFieldMap(str(fd, "checkout.fieldMap", 20_000));
  if (error) return fail(`Mapa de campos: ${error}`);
  await apply(actor, "checkout", {
    "checkout.provider": str(fd, "checkout.provider", 60) || "generic",
    "checkout.fieldMap": map,
    "checkout.webhookSecret": str(fd, "checkout.webhookSecret", 500),
    "checkout.signatureHeader": str(fd, "checkout.signatureHeader", 100),
  });
  return ok("Configurações do checkout salvas.");
}

export async function saveAccessCodeSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  await apply(actor, "accessCode", { "accessCode.validityDays": int(fd, "accessCode.validityDays", 180, 1, 3650) });
  return ok("Validade do código de acesso salva.");
}

export async function testEmailDelivery(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { session, actor } = await begin();
  const to = str(fd, "to", 254) || session.email;
  if (!isEmail(to)) return fail("Endereço de destino inválido.");
  const r = await sendTestEmail(to, actor);
  revalidatePath("/admin/emails");
  return r.ok ? ok(`E-mail de teste enviado para ${to}.`) : fail(`Falha: ${r.error ?? r.skipped}`);
}

// ---------- Administradores ----------

/**
 * "Alterar minha senha". Campos: `currentPassword`, `newPassword`, `confirmPassword` (changePasswordSchema).
 * Grava password_changed_at, o que derruba as outras sessões abertas (inclusive as de 30 dias), invalida
 * links de redefinição abertos e reemite a sessão atual (mantendo o "Lembrar de mim") para quem trocou não cair.
 */
export async function changeOwnPassword(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { session, actor } = await begin();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: rawField(fd, "currentPassword"),
    newPassword: rawField(fd, "newPassword"),
    confirmPassword: rawField(fd, "confirmPassword"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Confira os campos.", { fields: fieldErrors(parsed.error) });
  }
  const { currentPassword, newPassword } = parsed.data;
  const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, session.sub) });
  if (!user || !(await compare(currentPassword, user.passwordHash))) {
    return fail("Senha atual incorreta.", { fields: { currentPassword: "Senha atual incorreta." } });
  }
  const passwordHash = await hash(newPassword, 12);
  // Relógio da aplicação: o JWT reemitido abaixo tem iat >= floor(passwordChangedAt / 1000).
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(adminUsers).set({ passwordHash, passwordChangedAt: now }).where(eq(adminUsers.id, user.id));
    await invalidateOpenPasswordResets(tx, user.id, now);
  });
  await createAdminSession({ id: user.id, email: user.email, name: user.name }, { remember: session.rem === true });
  await audit(actor, "admin.password.change", { type: "admin_user", id: user.id });
  return ok("Senha alterada.");
}

/** Valor cru do FormData para os campos de senha (o schema faz trim e confere o tamanho). */
function rawField(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

export async function addAdminUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const email = str(fd, "email", 254).toLowerCase();
  const name = str(fd, "name", 100);
  const password = str(fd, "password", 200);
  if (!isEmail(email)) return fail("E-mail inválido.");
  if (!name) return fail("Informe o nome.");
  if (password.length < 10) return fail("A senha precisa ter pelo menos 10 caracteres.");
  const exists = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email), columns: { id: true } });
  if (exists) return fail("Já existe um administrador com este e-mail.");
  const [created] = await db.insert(adminUsers).values({ email, name, passwordHash: await hash(password, 12) }).returning({ id: adminUsers.id });
  await audit(actor, "admin.user.create", { type: "admin_user", id: created.id }, { email });
  revalidatePath("/admin/configuracoes");
  return ok(`Administrador ${email} criado.`);
}

export async function toggleAdminUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { session, actor } = await begin();
  const id = str(fd, "id", 64);
  if (id === session.sub) return fail("Você não pode desativar a sua própria conta.");
  const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, id) });
  if (!user) return fail("Administrador não encontrado.");
  const disabledAt = user.disabledAt ? null : new Date();
  await db.update(adminUsers).set({ disabledAt }).where(eq(adminUsers.id, user.id));
  await audit(actor, disabledAt ? "admin.user.disable" : "admin.user.enable", { type: "admin_user", id: user.id });
  revalidatePath("/admin/configuracoes");
  return ok(disabledAt ? `${user.email} desativado.` : `${user.email} reativado.`);
}
