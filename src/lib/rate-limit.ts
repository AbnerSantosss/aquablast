import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

/**
 * Limitador simples por janela fixa, persistido no banco (funciona com várias réplicas).
 * Retorna `allowed=false` quando a contagem na janela ultrapassa `limit`.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const now = new Date();
  const windowMs = windowSeconds * 1000;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        // Se a janela expirou, reinicia; senão incrementa.
        count: sql`CASE WHEN ${rateLimits.windowStart} < ${new Date(now.getTime() - windowMs)} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${rateLimits.windowStart} < ${new Date(now.getTime() - windowMs)} THEN ${now} ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning();
  const elapsed = now.getTime() - row.windowStart.getTime();
  const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));
  return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count), retryAfterSeconds };
}

/** IP do cliente atrás do Cloudflare Tunnel / proxy reverso. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}
