"use server";

import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { createAdminSession, destroyAdminSession, getAdminSession } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { str } from "@/lib/admin/form";
import { audit } from "@/lib/admin/audit";
import { fail, type ActionResult } from "@/lib/admin/types";

const GENERIC = "E-mail ou senha inválidos.";

/** Só aceita destinos internos do painel (evita open redirect). */
function safeNext(raw: string): string {
  if (raw.startsWith("/admin") && !raw.startsWith("//") && !raw.includes("://") && !raw.startsWith("/admin/login")) return raw;
  return "/admin";
}

export async function login(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await ensureBootstrap();
  const email = str(formData, "email", 254).toLowerCase();
  const password = str(formData, "password", 200);
  const next = safeNext(str(formData, "next", 500));
  if (!email || !password) return fail(GENERIC);

  const ip = clientIp(await headers());
  const rl = await rateLimit(`login:${ip}:${email}`, 5, 15 * 60);
  if (!rl.allowed) {
    return fail(`Muitas tentativas. Tente novamente em ${Math.ceil(rl.retryAfterSeconds / 60)} min.`);
  }

  const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
  // Compara mesmo sem usuário para não vazar existência pelo tempo de resposta.
  const okPass = await compare(password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid");
  if (!user || !okPass || user.disabledAt) return fail(GENERIC);

  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  await createAdminSession({ id: user.id, email: user.email, name: user.name });
  await audit(`admin:${user.email}`, "auth.login", { type: "admin_user", id: user.id }, { ip });
  redirect(next);
}

export async function logout(): Promise<void> {
  const s = await getAdminSession();
  if (s) await audit(`admin:${s.email}`, "auth.logout", { type: "admin_user", id: s.sub });
  await destroyAdminSession();
  redirect("/admin/login");
}
