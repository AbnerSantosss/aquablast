import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env, isProd } from "@/lib/env";

export const ADMIN_COOKIE = "aqb_admin";
export const BUYER_COOKIE = "aqb_order";

const ADMIN_TTL_SECONDS = 60 * 60 * 12; // 12h
const BUYER_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

export type AdminSession = { kind: "admin"; sub: string; email: string; name: string };
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

export async function createAdminSession(user: { id: string; email: string; name: string }): Promise<void> {
  const token = await sign({ kind: "admin", sub: user.id, email: user.email, name: user.name }, ADMIN_TTL_SECONDS);
  (await cookies()).set(ADMIN_COOKIE, token, cookieOptions(ADMIN_TTL_SECONDS));
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return verify<AdminSession>(token, "admin");
}

export async function destroyAdminSession(): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
}

/** Usar em Server Actions e route handlers do admin. Lança se não autenticado. */
export async function requireAdmin(): Promise<AdminSession> {
  const s = await getAdminSession();
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}

/** Verificação leve para o proxy (Edge): só valida a assinatura, sem tocar no banco. */
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
