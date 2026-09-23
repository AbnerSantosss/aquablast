import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";

/** Os endpoints /api/cron/* exigem `Authorization: Bearer <CRON_SECRET>` (comparação em tempo constante). */
export function cronAuthorized(request: Request): boolean {
  const header = (request.headers.get("authorization") ?? "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim() ?? "";
  if (!token) return false;
  return safeEqual(token, env().CRON_SECRET);
}

export function unauthorized(): Response {
  return Response.json({ ok: false, error: "Não autorizado" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
}
