import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries, type WebhookDelivery } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { ingestCheckoutWebhook } from "@/lib/checkout/ingest";
import { safeEqual, sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";

/**
 * POST /api/webhooks/checkout/<CHECKOUT_WEBHOOK_TOKEN>
 *
 * Camadas de proteção, nesta ordem:
 * 1. token na URL (comparação em tempo constante) — errado responde 404, sem pista;
 * 2. rate limit por IP (120/min);
 * 3. corpo até 256 KB; aceita JSON ou application/x-www-form-urlencoded;
 * 4. segredo opcional configurado no painel (`checkout.webhookSecret`):
 *    - com `checkout.signatureHeader`: HMAC-SHA256(corpo, segredo) em hex ou base64
 *      no header indicado (aceita prefixo "sha256=");
 *    - sem header: o segredo em `?secret=`, `x-webhook-secret` ou `Authorization: Bearer`;
 * 5. idempotência: mesmo corpo entregue de novo → 200 { duplicate: true } sem reprocessar.
 *
 * Erros de processamento respondem 200 { ok:false } de propósito: a entrega já está gravada
 * em webhook_deliveries para revisão no painel, e 5xx faria a plataforma reenviar sem parar.
 */
export const dynamic = "force-dynamic";

const SOURCE = "checkout";
const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT_PER_MINUTE = 120;

type Ctx = { params: Promise<{ token: string }> };

function tokenMatches(token: string): boolean {
  return safeEqual(token, env().CHECKOUT_WEBHOOK_TOKEN);
}

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });
const tooLarge = () => Response.json({ ok: false, error: "Corpo acima de 256 KB" }, { status: 413 });

/** Algumas plataformas fazem GET/ping na URL antes de salvar. */
export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { token } = await ctx.params;
  if (!tokenMatches(token)) return notFound();
  return Response.json({ ok: true });
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const { token } = await ctx.params;
  if (!tokenMatches(token)) return notFound();

  await ensureBootstrap();

  const ip = clientIp(request.headers);
  const limit = await rateLimit(`wh:checkout:${ip}`, RATE_LIMIT_PER_MINUTE, 60);
  if (!limit.allowed) {
    return Response.json({ ok: false, error: "Muitas requisições" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return tooLarge();
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return tooLarge();

  const contentType = request.headers.get("content-type") ?? "";
  const headers = pickHeaders(request.headers);
  const settings = await getSettings(["checkout.provider", "checkout.webhookSecret", "checkout.signatureHeader"] as const);
  const provider = settings["checkout.provider"] || "generic";
  const bodyHash = sha256Hex(SOURCE + raw);

  const parsed = parseBody(raw, contentType);
  if (!parsed.ok) {
    await recordDelivery({ provider, bodyHash, headers, payload: { _raw: raw.slice(0, 4_000) }, status: "error", detail: `Corpo não reconhecido (${contentType || "sem content-type"}): ${parsed.error}` });
    return Response.json({ ok: false, error: "Corpo inválido: envie JSON ou application/x-www-form-urlencoded" }, { status: 400 });
  }

  const auth = verifySecret(request, raw, settings["checkout.webhookSecret"], settings["checkout.signatureHeader"]);
  if (!auth.ok) {
    await recordDelivery({ provider, bodyHash, headers, payload: parsed.payload, status: "unauthorized", detail: auth.reason });
    log.warn("webhook checkout recusado", { ip, reason: auth.reason });
    return Response.json({ ok: false, error: "Assinatura ou segredo inválido" }, { status: 401 });
  }

  const delivery = await recordDelivery({ provider, bodyHash, headers, payload: parsed.payload, status: "received", detail: auth.mode === "none" ? null : `verificado por ${auth.mode}` });
  if (!delivery) return Response.json({ ok: true, duplicate: true });

  try {
    const outcome = await ingestCheckoutWebhook(delivery.id, parsed.payload);
    return Response.json({ ok: true, status: outcome.status, orderId: outcome.orderId, deliveryId: delivery.id });
  } catch (err) {
    const message = errorMessage(err);
    await db.update(webhookDeliveries).set({ status: "error", detail: message, processedAt: new Date() }).where(eq(webhookDeliveries.id, delivery.id));
    log.error("webhook checkout: falha ao processar", { deliveryId: delivery.id, error: message });
    return Response.json({ ok: false, error: "Falha ao processar; entrega registrada para revisão", deliveryId: delivery.id }, { status: 200 });
  }
}

// ---------- helpers ----------

type Parsed = { ok: true; payload: unknown } | { ok: false; error: string };

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** JSON por padrão; form-urlencoded vira objeto plano (valores que parecem JSON são expandidos). */
function parseBody(raw: string, contentType: string): Parsed {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "corpo vazio" };
  const isForm = /application\/x-www-form-urlencoded/i.test(contentType);
  const looksJson = /^[[{]/.test(trimmed);
  if (!isForm || looksJson) {
    try {
      return { ok: true, payload: JSON.parse(trimmed) };
    } catch {
      if (!isForm && !trimmed.includes("=")) return { ok: false, error: "JSON inválido" };
    }
  }
  const obj: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    const v = value.trim();
    obj[key] = /^[[{]/.test(v) ? tryJson(v) : value;
  }
  if (!Object.keys(obj).length) return { ok: false, error: "formulário vazio" };
  return { ok: true, payload: obj };
}

type Auth = { ok: true; mode: "none" | "hmac" | "secret" } | { ok: false; reason: string };

function verifySecret(request: Request, raw: string, secret: string, signatureHeader: string): Auth {
  if (!secret) return { ok: true, mode: "none" };
  const headerName = signatureHeader.trim();

  if (headerName) {
    const value = request.headers.get(headerName);
    if (!value) return { ok: false, reason: `Header de assinatura "${headerName}" ausente` };
    const hex = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
    const b64 = createHmac("sha256", secret).update(raw, "utf8").digest("base64");
    const b64url = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const candidates = value
      .split(",")
      .map((part) => part.trim().replace(/^(sha256|v1|s|sig|signature)=/i, "").trim())
      .filter(Boolean);
    const matches = candidates.some((c) => safeEqual(c.toLowerCase(), hex) || safeEqual(c, b64) || safeEqual(c, b64.replace(/=+$/, "")) || safeEqual(c, b64url));
    return matches ? { ok: true, mode: "hmac" } : { ok: false, reason: `Assinatura HMAC-SHA256 no header "${headerName}" não confere` };
  }

  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  const provided = new URL(request.url).searchParams.get("secret") ?? request.headers.get("x-webhook-secret") ?? bearer ?? "";
  if (!provided) return { ok: false, reason: "Segredo do webhook ausente (?secret=, header x-webhook-secret ou Authorization: Bearer)" };
  return safeEqual(provided, secret) ? { ok: true, mode: "secret" } : { ok: false, reason: "Segredo do webhook não confere" };
}

const BLOCKED_HEADER = /cookie|authorization|secret|token|password|api-?key/i;

/** Guarda só headers úteis para diagnóstico; nunca credenciais. */
function pickHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    const k = key.toLowerCase();
    if (BLOCKED_HEADER.test(k)) return;
    if (k === "content-type" || k === "user-agent" || k === "content-length" || k.startsWith("x-") || k.startsWith("cf-")) {
      out[k] = value.slice(0, 500);
    }
  });
  return out;
}

interface DeliveryInput {
  provider: string;
  bodyHash: string;
  headers: Record<string, string>;
  payload: unknown;
  status: WebhookDelivery["status"];
  detail: string | null;
}

/** Insere a entrega; devolve null quando (source, bodyHash) já existia (entrega duplicada). */
async function recordDelivery(input: DeliveryInput): Promise<WebhookDelivery | null> {
  const [row] = await db
    .insert(webhookDeliveries)
    .values({
      source: SOURCE,
      provider: input.provider,
      bodyHash: input.bodyHash,
      headers: input.headers,
      payload: input.payload as object,
      status: input.status,
      detail: input.detail,
      processedAt: input.status === "received" ? null : new Date(),
    })
    .onConflictDoNothing({ target: [webhookDeliveries.source, webhookDeliveries.bodyHash] })
    .returning();
  return row ?? null;
}
