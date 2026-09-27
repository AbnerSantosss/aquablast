"use server";

import { eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { createAdminSession } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/rate-limit";
import { str } from "@/lib/admin/form";
import { audit } from "@/lib/admin/audit";

/*
 * Entrada rápida SÓ para desenvolvimento. Arquivo "use server": o export é um endpoint público,
 * então quem protege é a action, não o botão escondido. Duas travas, as duas obrigatórias:
 *   1. NODE_ENV === "development" (só `next dev`; `next build`/`next start` e a imagem Docker são "production");
 *   2. o pedido chegou por localhost (um `next dev` exposto por túnel ou pela rede não abre o painel).
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  return LOCAL_HOSTS.has(host.replace(/:\d+$/, "").toLowerCase());
}

/** Só aceita destinos internos do painel (evita open redirect). */
function safeNext(raw: string): string {
  if (raw.startsWith("/admin") && !raw.startsWith("//") && !raw.includes("://") && !raw.startsWith("/admin/login")) return raw;
  return "/admin";
}

export async function devQuickLogin(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV !== "development") redirect("/admin/login");
  const h = await headers();
  // Atrás de proxy/túnel o host de quem pediu vem em x-forwarded-host; se existir, é ele que vale.
  if (!isLocalHost(h.get("x-forwarded-host") ?? h.get("host"))) redirect("/admin/login");

  await ensureBootstrap();
  const email = env().ADMIN_EMAIL;
  const preferred = email ? await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) }) : undefined;
  const user =
    preferred && !preferred.disabledAt
      ? preferred
      : await db.query.adminUsers.findFirst({ where: isNull(adminUsers.disabledAt) });
  if (!user) redirect("/admin/login");

  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  await createAdminSession({ id: user.id, email: user.email, name: user.name }, { remember: false });
  await audit(`admin:${user.email}`, "auth.login.dev", { type: "admin_user", id: user.id }, { ip: clientIp(h) });
  redirect(safeNext(str(formData, "next", 500)));
}
