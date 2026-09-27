import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentAttempts, webhookDeliveries, type WebhookDelivery } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { safeEqual, sha256Hex } from "@/lib/crypto";
import { getGateway, type Gateway, type GatewayName } from "@/lib/gateways";
import { errorMessage, log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { syncAttempt } from "@/app/api/checkout/_lib/sync";

/**
 * POST /api/webhooks/gateway/<provider>/<gateway.postbackToken> (plano 7.4) — postback dos gateways
 * de pagamento do checkout próprio: ironpay, mercadopago e fastpay. É esta URL que vai no `postbackUrl`
 * do `charge()` e que se cadastra no painel do gateway.
 *
 * Camadas, nesta ordem:
 * 1. provider na lista e token na URL igual a `gateway.postbackToken` (tempo constante). Vazio/errado → 404;
 * 2. rate limit 120/min por IP;
 * 3. corpo até 256 KB (JSON ou form; vazio vira {});
 * 4. Mercado Pago com `gateway.mercadopago.webhookSecret` preenchido: valida `x-signature`
 *    (HMAC-SHA256 do manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`). Outros gateways:
 *    `gw.verifyWebhook` quando existir. Falhou → 401 e entrega `unauthorized`;
 * 5. grava em webhook_deliveries (source "gateway"); entrega repetida é reprocessada (é idempotente);
 * 6. **ignora o status do corpo**: tira só o id (`gw.extractWebhook`) e consulta `gw.fetchStatus(id)`;
 * 7. acha a tentativa por (provider, providerTransactionId); não achou → `unmapped`, 200;
 * 8. aplica com syncAttempt (pago → pedido pago + carrinho convertido + Purchase; estorno; cancelamento
 *    só sem outra tentativa em aberto; recusa não cancela).
 * Erro interno → 200 { ok:false } de propósito: 5xx faz o gateway reenviar sem parar.
 */
export const dynamic = "force-dynamic";

const SOURCE = "gateway";
const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT_PER_MINUTE = 120;
const PROVIDERS: readonly GatewayName[] = ["ironpay", "mercadopago", "fastpay"];

type Ctx = { params: Promise<{ provider: string; token: string }> };

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

function isProvider(v: string): v is GatewayName {
  return (PROVIDERS as readonly string[]).includes(v);
}

async function authorizedPath(ctx: Ctx): Promise<{ provider: GatewayName; secrets: { mpSecret: string } } | null> {
  const { provider, token } = await ctx.params;
  if (!isProvider(provider)) return null;
  await ensureBootstrap();
  const s = await getSettings(["gateway.postbackToken", "gateway.mercadopago.webhookSecret"] as const);
  const expected = s["gateway.postbackToken"];
  if (!expected || !safeEqual(token, expected)) return null;
  return { provider, secrets: { mpSecret: s["gateway.mercadopago.webhookSecret"] } };
}

/** Alguns gateways fazem GET/ping na URL antes de salvar. */
export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  return (await authorizedPath(ctx)) ? Response.json({ ok: true }) : notFound();
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const auth = await authorizedPath(ctx);
  if (!auth) return notFound();
  const { provider } = auth;
  const gw = getGateway(provider);

  const ip = clientIp(request.headers);
  const limit = await rateLimit(`wh:gateway:${ip}`, RATE_LIMIT_PER_MINUTE, 60);
  if (!limit.allowed) {
    return Response.json({ ok: false, error: "Muitas requisições" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return tooLarge();
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return tooLarge();

  const url = new URL(request.url);
  const headers = pickHeaders(request.headers);
  const payload = parseBody(raw, request.headers.get("content-type") ?? "");
  // Query entra no hash: o Mercado Pago manda o id também em ?data.id= (o token fica no caminho, não aqui).
  const bodyHash = sha256Hex(`${SOURCE}:${provider}:${url.search}:${raw}`);

  const verified = await verify(gw, auth.secrets.mpSecret, request.headers, raw, url);
  if (!verified.ok) {
    await recordDelivery({ provider, bodyHash, headers, payload, status: "unauthorized", detail: verified.reason, orderId: null });
    log.warn("webhook gateway recusado", { ip, provider, reason: verified.reason });
    return Response.json({ ok: false, error: "Assinatura inválida" }, { status: 401 });
  }

  const delivery = await recordDelivery({ provider, bodyHash, headers, payload, status: "received", detail: verified.mode === "none" ? null : `verificado por ${verified.mode}`, orderId: null });
  if (!delivery) {
    log.error("webhook gateway: não foi possível registrar a entrega", { provider });
    return Response.json({ ok: false }, { status: 200 });
  }

  try {
    const { transactionId } = gw.extractWebhook(payload, url);
    if (!transactionId) {
      await finish(delivery.id, "ignored", "sem id de transação no postback", null);
      return Response.json({ ok: true, status: "ignored" });
    }

    const attempt = await db.query.paymentAttempts.findFirst({
      where: and(eq(paymentAttempts.provider, provider), eq(paymentAttempts.providerTransactionId, transactionId)),
    });
    if (!attempt) {
      await finish(delivery.id, "unmapped", `transação ${transactionId.slice(0, 80)} sem tentativa de pagamento conhecida`, null);
      return Response.json({ ok: true, status: "unmapped" });
    }

    // O status do corpo é ignorado: a fonte da verdade é a consulta ao gateway.
    const st = await gw.fetchStatus(transactionId);
    if (st.status === "error") {
      await finish(delivery.id, "error", `consulta ao gateway falhou${st.reason ? `: ${st.reason.slice(0, 200)}` : ""}`, attempt.orderId);
      return Response.json({ ok: false, deliveryId: delivery.id }, { status: 200 });
    }

    const out = await syncAttempt(attempt, st, "system");
    await finish(delivery.id, "processed", [`gateway: ${st.status}`, ...out.detail].join("; ").slice(0, 1000), attempt.orderId);
    return Response.json({ ok: true, status: "processed", deliveryId: delivery.id });
  } catch (err) {
    const message = errorMessage(err).slice(0, 500);
    await finish(delivery.id, "error", message, null).catch(() => undefined);
    log.error("webhook gateway: falha ao processar", { deliveryId: delivery.id, provider, error: message });
    return Response.json({ ok: false, error: "Falha ao processar; entrega registrada para revisão", deliveryId: delivery.id }, { status: 200 });
  }
}

// ---------- helpers ----------

const tooLarge = () => Response.json({ ok: false, error: "Corpo acima de 256 KB" }, { status: 413 });

type Verified = { ok: true; mode: "none" | "x-signature" | "gateway" } | { ok: false; reason: string };

async function verify(gw: Gateway, mpSecret: string, h: Headers, rawBody: string, url: URL): Promise<Verified> {
  if (gw.name === "mercadopago") {
    // Validação local do x-signature. Sem segredo no painel, vale só o token da URL.
    if (!mpSecret) return { ok: true, mode: "none" };
    return verifyMercadoPagoSignature(h, url, mpSecret) ? { ok: true, mode: "x-signature" } : { ok: false, reason: "x-signature do Mercado Pago ausente ou não confere" };
  }
  if (!gw.verifyWebhook) return { ok: true, mode: "none" };
  try {
    return (await gw.verifyWebhook({ headers: h, rawBody, url })) ? { ok: true, mode: "gateway" } : { ok: false, reason: "assinatura do gateway não confere" };
  } catch (err) {
    return { ok: false, reason: `falha ao verificar assinatura: ${errorMessage(err).slice(0, 200)}` };
  }
}

/**
 * Mercado Pago: header `x-signature: ts=<ts>,v1=<hmac>` + `x-request-id`.
 * Manifest `id:<data.id da query, minúsculo>;request-id:<x-request-id>;ts:<ts>;` — partes sem valor saem.
 * HMAC-SHA256 em hex com o segredo do webhook, comparado em tempo constante com `v1`.
 */
function verifyMercadoPagoSignature(h: Headers, url: URL, secret: string): boolean {
  const signature = h.get("x-signature");
  if (!signature) return false;
  let ts = "";
  let v1 = "";
  for (const part of signature.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "ts") ts = value;
    else if (key === "v1") v1 = value;
  }
  if (!ts || !v1) return false;
  const dataId = url.searchParams.get("data.id")?.trim().toLowerCase() ?? "";
  const requestId = h.get("x-request-id")?.trim() ?? "";
  let manifest = "";
  if (dataId) manifest += `id:${dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest, "utf8").digest("hex");
  return safeEqual(v1.toLowerCase(), expected);
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** JSON ou form-urlencoded. Corpo vazio vira {} (o Mercado Pago pode mandar o id só na query). */
function parseBody(raw: string, contentType: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const isForm = /application\/x-www-form-urlencoded/i.test(contentType);
  if (!isForm || /^[[{]/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      if (!isForm && !trimmed.includes("=")) return { _raw: trimmed.slice(0, 4_000) };
    }
  }
  const obj: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    const v = value.trim();
    obj[key] = /^[[{]/.test(v) ? tryJson(v) : value;
  }
  return obj;
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
  orderId: string | null;
}

/**
 * Insere a entrega. Se (source, bodyHash) já existe, devolve a linha existente atualizada para o novo status:
 * o processamento é idempotente (sempre consulta o gateway), então a entrega repetida é reprocessada.
 */
async function recordDelivery(input: DeliveryInput): Promise<WebhookDelivery | null> {
  const processedAt = input.status === "received" ? null : new Date();
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
      orderId: input.orderId,
      processedAt,
    })
    .onConflictDoNothing({ target: [webhookDeliveries.source, webhookDeliveries.bodyHash] })
    .returning();
  if (row) return row;
  const [existing] = await db
    .update(webhookDeliveries)
    .set({ status: input.status, detail: input.detail ? `reentrega: ${input.detail}` : "reentrega", processedAt })
    .where(and(eq(webhookDeliveries.source, SOURCE), eq(webhookDeliveries.bodyHash, input.bodyHash)))
    .returning();
  return existing ?? null;
}

async function finish(id: string, status: WebhookDelivery["status"], detail: string, orderId: string | null): Promise<void> {
  await db
    .update(webhookDeliveries)
    .set({ status, detail, processedAt: new Date(), ...(orderId ? { orderId } : {}) })
    .where(eq(webhookDeliveries.id, id));
}
