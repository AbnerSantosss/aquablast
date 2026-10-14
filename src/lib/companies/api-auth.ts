import { sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, type Company } from "@/db/schema";
import { getCompanyByApiKeyHash } from "@/lib/companies";
import { safeEqual, sha256Hex } from "@/lib/crypto";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Autenticação e CORS da API v1 (outras LPs). A chave vai em `Authorization: Bearer <chave>`; guardamos só o
 * SHA-256 dela em companies.api_key_hash. CORS só para as origens cadastradas em companies.allowed_origins.
 */

const RATE_PER_MINUTE = 120;
const AUTH_FAIL_PER_MINUTE = 20;

type ErrorCode = "bad_request" | "unauthorized" | "forbidden" | "not_found" | "rate_limited" | "server_error";

/** Cabeçalhos CORS para uma origem JÁ validada (null = sem CORS, chamada servidor a servidor). */
export function corsHeaders(allowedOrigin: string | null): Record<string, string> {
  if (!allowedOrigin) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function v1Json(body: unknown, status: number, origin: string | null = null, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...corsHeaders(origin), ...extra } });
}

export function v1Error(status: number, code: ErrorCode, message: string, origin: string | null = null, extra: Record<string, string> = {}): Response {
  return v1Json({ error: { code, message } }, status, origin, extra);
}

function normalizeOrigin(o: string): string {
  return o.trim().replace(/\/+$/, "").toLowerCase();
}

function originAllowed(company: Pick<Company, "allowedOrigins">, origin: string): boolean {
  const want = normalizeOrigin(origin);
  return (company.allowedOrigins ?? []).some((o) => normalizeOrigin(o) === want);
}

/**
 * Preflight OPTIONS: o navegador não manda a chave, então liberamos se a origem consta em QUALQUER empresa ativa.
 * A chamada real continua exigindo a chave e a origem da PRÓPRIA empresa.
 */
export async function preflightResponse(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!origin) return new Response(null, { status: 204, headers: corsHeaders(null) });
  const wanted = normalizeOrigin(origin);
  try {
    const rows = await db
      .select({ id: companies.id })
      .from(companies)
      .where(
        sql`${companies.active} = true AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(${companies.allowedOrigins}) AS o WHERE lower(rtrim(o, '/')) = ${wanted})`,
      )
      .limit(1);
    if (rows.length === 0) return new Response(null, { status: 403, headers: corsHeaders(null) });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  } catch {
    return new Response(null, { status: 500, headers: corsHeaders(null) });
  }
}

export type V1Auth = { ok: true; company: Company; origin: string | null } | { ok: false; response: Response };

/** Valida chave, empresa ativa, origem (quando houver cabeçalho Origin) e limite de chamadas. */
export async function authenticateCompany(request: Request): Promise<V1Auth> {
  const ip = clientIp(request.headers);
  const authFail = async (status: number, code: ErrorCode, message: string): Promise<V1Auth> => {
    const lim = await rateLimit(`api.v1.authfail:${ip}`, AUTH_FAIL_PER_MINUTE, 60);
    if (!lim.allowed) return { ok: false, response: v1Error(429, "rate_limited", "Muitas tentativas.", null, { "Retry-After": String(lim.retryAfterSeconds) }) };
    return { ok: false, response: v1Error(status, code, message) };
  };

  const match = /^Bearer\s+(\S{8,200})$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return authFail(401, "unauthorized", "Envie Authorization: Bearer <chave>.");

  const hash = sha256Hex(match[1]);
  const company = await getCompanyByApiKeyHash(hash);
  if (!company || !company.apiKeyHash || !safeEqual(hash, company.apiKeyHash)) return authFail(401, "unauthorized", "Chave de API inválida.");
  if (!company.active) return { ok: false, response: v1Error(403, "forbidden", "Empresa desativada.") };

  const origin = request.headers.get("origin");
  let allowedOrigin: string | null = null;
  if (origin) {
    if (!originAllowed(company, origin)) return { ok: false, response: v1Error(403, "forbidden", "Origem não permitida para esta empresa.") };
    allowedOrigin = origin;
  }

  const lim = await rateLimit(`api.v1.company:${company.id}`, RATE_PER_MINUTE, 60);
  if (!lim.allowed) {
    return { ok: false, response: v1Error(429, "rate_limited", "Limite de chamadas atingido. Tente em instantes.", allowedOrigin, { "Retry-After": String(lim.retryAfterSeconds) }) };
  }
  return { ok: true, company, origin: allowedOrigin };
}
