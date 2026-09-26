import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { env, isProd } from "@/lib/env";

export const ADMIN_COOKIE = "aqb_admin";
export const BUYER_COOKIE = "aqb_order";

const ADMIN_TTL_SECONDS = 60 * 60 * 12; // 12h
/** "Lembrar de mim" marcado no login. */
const ADMIN_REMEMBER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias
const BUYER_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Payload do JWT do painel. `rem` = sessão longa do "Lembrar de mim" (tokens antigos não têm: vale false).
 * `iat`/`exp` são preenchidos pelo jose (segundos Unix).
 */
export type AdminSession = { kind: "admin"; sub: string; email: string; name: string; rem?: boolean; iat?: number; exp?: number };
export type BuyerSession = { kind: "buyer"; orderId: string; codeId: string };

function secretKey() {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

async function sign(payload: Record<string, unknown>, ttlSeconds: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secretKey());
}

async function verify<T>(token: string | undefined, kind: T extends { kind: infer K } ? K : never): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.kind !== kind) return null;
    return payload as unknown as T;
  } catch {
    return null;
  }
}

/** Opções compartilhadas: HttpOnly, SameSite=Lax, Secure em produção. */
function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd(),
    path: "/",
    maxAge,
  };
}

// ---------- Admin ----------

/**
 * Emite o cookie do painel. `remember` = "Lembrar de mim": 30 dias; senão 12 h.
 * O exp do JWT e o maxAge do cookie são sempre iguais.
 */
export async function createAdminSession(user: { id: string; email: string; name: string }, { remember }: { remember: boolean }): Promise<void> {
  const ttl = remember ? ADMIN_REMEMBER_TTL_SECONDS : ADMIN_TTL_SECONDS;
  const token = await sign({ kind: "admin", sub: user.id, email: user.email, name: user.name, rem: remember }, ttl);
  (await cookies()).set(ADMIN_COOKIE, token, cookieOptions(ttl));
}

/**
 * Só confere a assinatura do cookie (sem banco). Não use para autorizar: uma sessão revogada
 * (senha trocada, admin desativado) continua com assinatura válida. Para isso: getActiveAdminSession.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return verify<AdminSession>(token, "admin");
}

/**
 * Sessão do painel conferida no banco: assinatura válida, admin existe, não está desativado e o JWT
 * foi emitido depois da última troca de senha (iat >= floor(password_changed_at / 1000)).
 * Assim trocar ou redefinir a senha derruba todas as sessões abertas, inclusive as de 30 dias.
 * `cache` deduplica a consulta dentro do mesmo request (layout + página chamam).
 */
export const getActiveAdminSession = cache(async (): Promise<AdminSession | null> => {
  const session = await getAdminSession();
  if (!session || typeof session.sub !== "string" || !UUID_RE.test(session.sub)) return null;
  // A coluna password_changed_at só existe depois que o bootstrap aplicou a migration 0001.
  await ensureBootstrap();
  const user = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.id, session.sub),
    columns: { email: true, name: true, disabledAt: true, passwordChangedAt: true },
  });
  if (!user || user.disabledAt) return null;
  if (user.passwordChangedAt) {
    const iat = typeof session.iat === "number" ? session.iat : 0;
    if (iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) return null;
  }
  return { ...session, email: user.email, name: user.name, rem: session.rem === true };
});

export async function destroyAdminSession(): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
}

/**
 * Usar em Server Actions e páginas do painel. Sem sessão ativa (ver getActiveAdminSession),
 * redireciona para /admin/login. Não chame dentro de try/catch: o redirect lança NEXT_REDIRECT.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const s = await getActiveAdminSession();
  if (!s) redirect("/admin/login");
  return s;
}

/** Verificação leve (só assinatura, sem banco). O proxy tem a própria cópia desta checagem. */
export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  return (await verify<AdminSession>(token, "admin")) !== null;
}

// ---------- Comprador (página /rastrear) ----------

export async function createBuyerSession(orderId: string, codeId: string): Promise<void> {
  const token = await sign({ kind: "buyer", orderId, codeId }, BUYER_TTL_SECONDS);
  (await cookies()).set(BUYER_COOKIE, token, cookieOptions(BUYER_TTL_SECONDS));
}

export async function getBuyerSession(): Promise<BuyerSession | null> {
  const token = (await cookies()).get(BUYER_COOKIE)?.value;
  return verify<BuyerSession>(token, "buyer");
}

export async function destroyBuyerSession(): Promise<void> {
  (await cookies()).set(BUYER_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
}
