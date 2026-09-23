import type { NextRequest } from "next/server";

/** Cabeçalhos comuns às respostas JSON da API pública de pedidos (nunca cacheável). */
export const NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
};

export type ApiErrorCode = "bad_request" | "forbidden" | "unauthorized" | "not_found" | "rate_limited" | "server_error";

export function jsonError(status: number, code: ApiErrorCode, message: string, extraHeaders: Record<string, string> = {}): Response {
  return Response.json({ error: { code, message } }, { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } });
}

/**
 * Só aceita requisições disparadas pela própria origem (CSRF). Permite ausência de sinal
 * (clientes sem Fetch Metadata) e `Sec-Fetch-Site: same-origin | none`; qualquer `Origin`
 * presente precisa bater com o host efetivo (atrás do proxy, `x-forwarded-host`).
 */
export function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // navegação/fetch sem Origin (GET simples, clientes antigos)
  if (origin === "null") return false; // origem opaca (sandbox, file://)
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
