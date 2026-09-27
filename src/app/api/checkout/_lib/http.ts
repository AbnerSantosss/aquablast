import { env, isProd } from "@/lib/env";

/**
 * Utilitários HTTP das rotas do checkout próprio (Fase 7). Pasta `_lib` = privada no App Router (não vira rota).
 * Regras que valem para todas as rotas daqui:
 * - resposta JSON com `Cache-Control: no-store`;
 * - NUNCA ecoar o corpo recebido (pode ter dados de cartão) nem erro cru de gateway;
 * - POST do navegador só com `Origin` igual à origem de APP_URL (CSRF).
 */
export const NO_STORE: Record<string, string> = { "Cache-Control": "private, no-store" };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/** Erro padrão `{ ok:false, error, field? }`. `extra` só com dados seguros (nunca o que o navegador mandou). */
export function fail(status: number, error: string, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, error, ...extra }, status);
}

export function tooMany(retryAfterSeconds: number): Response {
  return json({ ok: false, error: "Muitas tentativas. Aguarde um instante e tente de novo." }, 429, { "Retry-After": String(retryAfterSeconds) });
}

/** URL absoluta a partir de APP_URL (sem barra dupla). */
export function appUrl(path: string): string {
  return `${env().APP_URL.replace(/\/+$/, "")}${path}`;
}

/**
 * Verificação de origem (plano 7, "Verificação de origem"): o header `Origin` tem que ser a origem de APP_URL.
 * - `Sec-Fetch-Site` diferente de same-origin/none → recusa.
 * - Sem `Origin` (ou "null") → recusa: todo fetch POST de navegador moderno manda Origin.
 * - Fora de produção também aceita o próprio host da requisição (o servidor de dev roda em outra porta que APP_URL).
 */
export function originAllowed(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  try {
    if (o.origin === new URL(env().APP_URL).origin) return true;
  } catch {
    return false;
  }
  if (isProd()) return false;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host");
  return !!host && o.host.toLowerCase() === host.toLowerCase();
}

export type BodyResult = { ok: true; data: unknown } | { ok: false; response: Response };

/** Lê o corpo JSON com limite de tamanho. Em erro devolve resposta pronta, sem ecoar o conteúdo. */
export async function readJson(request: Request, maxBytes: number): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return { ok: false, response: fail(413, "Requisição grande demais.") };
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: fail(400, "Requisição inválida.") };
  }
  if (Buffer.byteLength(raw, "utf8") > maxBytes) return { ok: false, response: fail(413, "Requisição grande demais.") };
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return { ok: false, response: fail(400, "Requisição inválida: envie JSON.") };
  }
}
