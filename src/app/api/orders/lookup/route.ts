import type { NextRequest } from "next/server";
import { createBuyerSession } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { normalizeAccessCode, sha256Hex } from "@/lib/crypto";
import { getPublicOrder, resolveAccessCode } from "@/lib/orders/service";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { NO_STORE_HEADERS, isSameOrigin, jsonError } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IP_LIMIT = 10; // consultas por minuto por IP
const CODE_LIMIT = 5; // tentativas por minuto por código (mesmo inválido)
const WINDOW_SECONDS = 60;
const MAX_CODE_LENGTH = 200;

const NOT_FOUND_MESSAGE = "Não foi possível localizar o pedido com esse código. Confira a confirmação da compra.";

/**
 * POST /api/orders/lookup — corpo `{ code }`.
 * 200 `{ order }` (snapshot público) e cookie de sessão do comprador para o SSE;
 * 400 corpo inválido; 403 origem cruzada; 404 código inválido/expirado/revogado (sem distinguir);
 * 429 excesso de consultas (com `Retry-After`); 500 falha genérica. Sem CORS, sem cache.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden", "Origem não permitida.");
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonError(400, "bad_request", "Envie o código em JSON.");
  }

  let code: string;
  try {
    const body: unknown = await request.json();
    const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>).code : undefined;
    if (typeof raw !== "string") return jsonError(400, "bad_request", "Informe o código de acesso.");
    code = normalizeAccessCode(raw);
    if (!code || code.length > MAX_CODE_LENGTH) return jsonError(400, "bad_request", "Informe o código de acesso.");
  } catch {
    return jsonError(400, "bad_request", "Corpo da requisição inválido.");
  }

  try {
    await ensureBootstrap();

    const ip = clientIp(request.headers);
    const byIp = await rateLimit(`orders.lookup.ip:${ip}`, IP_LIMIT, WINDOW_SECONDS);
    if (!byIp.allowed) return tooMany(byIp.retryAfterSeconds);
    const byCode = await rateLimit(`orders.lookup.code:${sha256Hex(code.replace(/-/g, ""))}`, CODE_LIMIT, WINDOW_SECONDS);
    if (!byCode.allowed) return tooMany(byCode.retryAfterSeconds);

    const resolved = await resolveAccessCode(code);
    if (!resolved) return jsonError(404, "not_found", NOT_FOUND_MESSAGE);
    const order = await getPublicOrder(resolved.order.id);
    if (!order) return jsonError(404, "not_found", NOT_FOUND_MESSAGE);

    await createBuyerSession(order.id, resolved.codeId);
    return Response.json({ order }, { status: 200, headers: NO_STORE_HEADERS });
  } catch {
    return jsonError(500, "server_error", "Não foi possível consultar seu pedido agora. Tente novamente em instantes.");
  }
}

function tooMany(retryAfterSeconds: number): Response {
  return jsonError(429, "rate_limited", "Muitas consultas em sequência. Aguarde um pouco antes de tentar novamente.", {
    "Retry-After": String(retryAfterSeconds),
  });
}
