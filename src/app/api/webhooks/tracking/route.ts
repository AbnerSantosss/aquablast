import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { webhookDeliveries, type WebhookDelivery } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { safeEqual, sha256Hex } from "@/lib/crypto";
import { errorMessage, log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { getTrackingProvider, type TrackingProvider, type TrackingSnapshot } from "@/lib/tracking/provider";
import { applySnapshot, findOrderByTrackingCode } from "@/lib/tracking/sync";

/**
 * POST /api/webhooks/tracking — push do 17TRACK (event TRACKING_UPDATED etc.).
 *
 * Assinatura (doc oficial v2.2, "Webhook → Signature"): header `sign` =
 * SHA256( corpoBruto + "/" + apiKey ) em hex. Verificada quando a chave está no painel
 * e o header veio; sem header a entrega é aceita e marcada "sem assinatura".
 *
 * O push é tratado como DICA, nunca como verdade: para cada código encontrado no banco
 * a app reconsulta a API do 17TRACK (`provider.fetch`) e só cai para o snapshot do push
 * se a consulta falhar. Assim um push forjado sem assinatura não consegue inventar status.
 *
 * O 17TRACK exige 200 rápido; o processamento pesado roda em `after()` depois da resposta
 * e o resultado fica em webhook_deliveries (status/detail) para o painel.
 */
export const dynamic = "force-dynamic";

const SOURCE = "tracking";
const PROVIDER = "17track";
const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT_PER_MINUTE = 120;

/** Ping/validação de URL. */
export async function GET(): Promise<Response> {
  return Response.json({ ok: true });
}

export async function POST(request: Request): Promise<Response> {
  await ensureBootstrap();

  const ip = clientIp(request.headers);
  const limit = await rateLimit(`wh:tracking:${ip}`, RATE_LIMIT_PER_MINUTE, 60);
  if (!limit.allowed) {
    return Response.json({ ok: false, error: "Muitas requisições" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return Response.json({ ok: false, error: "Corpo acima de 256 KB" }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return Response.json({ ok: false, error: "Corpo acima de 256 KB" }, { status: 413 });

  const headers = pickHeaders(request.headers);
  const bodyHash = sha256Hex(SOURCE + raw);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    await recordDelivery({ bodyHash, headers, payload: { _raw: raw.slice(0, 4_000) }, status: "error", detail: "Corpo não é JSON válido" });
    return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const s = await getSettings(["tracking.17track.apiKey"] as const);
  const apiKey = s["tracking.17track.apiKey"];
  const sign = request.headers.get("sign")?.trim() ?? "";
  const notes: string[] = [];
  if (apiKey && sign) {
    const expected = sha256Hex(`${raw}/${apiKey}`);
    if (!safeEqual(sign.toLowerCase(), expected)) {
      await recordDelivery({ bodyHash, headers, payload, status: "unauthorized", detail: "Header sign não confere com SHA256(corpo + '/' + chave)" });
      log.warn("webhook tracking recusado: assinatura inválida", { ip });
      return Response.json({ ok: false, error: "Assinatura inválida" }, { status: 401 });
    }
    notes.push("assinatura válida");
  } else if (!sign) {
    notes.push("sem assinatura");
  } else {
    notes.push("assinatura não verificada (chave do 17TRACK não configurada)");
  }

  const delivery = await recordDelivery({ bodyHash, headers, payload, status: "received", detail: notes.join("; ") });
  if (!delivery) return Response.json({ ok: true, duplicate: true });

  after(() => processDelivery(delivery.id, payload, notes, apiKey.length > 0));
  return Response.json({ ok: true, deliveryId: delivery.id, queued: true });
}

// ---------- processamento (depois do 200) ----------

async function processDelivery(deliveryId: string, payload: unknown, notes: string[], hasApiKey: boolean): Promise<void> {
  const finish = async (status: WebhookDelivery["status"], detail: string, orderId: string | null = null) => {
    await db.update(webhookDeliveries).set({ status, detail, orderId, processedAt: new Date() }).where(eq(webhookDeliveries.id, deliveryId));
  };

  try {
    let provider: TrackingProvider;
    try {
      provider = await getTrackingProvider();
    } catch (err) {
      await finish("ignored", [...notes, `provedor indisponível: ${errorMessage(err)}`].join("; "));
      return;
    }
    if (provider.kind !== "17track") {
      await finish("ignored", [...notes, "rastreio em modo manual; push ignorado"].join("; "));
      return;
    }

    const snapshots = provider.parseWebhook(payload);
    if (!snapshots.length) {
      await finish("ignored", [...notes, "payload sem rastreios reconhecidos (esperado data.number ou data.accepted[])"].join("; "));
      return;
    }

    const details: string[] = [];
    let firstOrderId: string | null = null;
    let applied = 0;

    for (const pushed of snapshots) {
      const order = await findOrderByTrackingCode(pushed.code);
      if (!order) {
        details.push(`${pushed.code}: nenhum pedido com este código`);
        continue;
      }

      let effective: TrackingSnapshot = pushed;
      if (hasApiKey) {
        const carrier = order.carrierCode ? Number(order.carrierCode) : pushed.carrierCode ? Number(pushed.carrierCode) : null;
        try {
          const fresh = await provider.fetch(pushed.code, carrier);
          if (fresh) effective = fresh;
          else details.push(`${pushed.code}: API sem dados, usando o push`);
        } catch (err) {
          details.push(`${pushed.code}: consulta à API falhou (${errorMessage(err)}), usando o push`);
        }
      }

      const r = await applySnapshot(order, effective);
      applied++;
      firstOrderId ??= order.id;
      details.push(`${pushed.code}: pedido ${order.orderNumber} — ${r.newEvents} evento(s) novo(s)${r.statusChanged ? ", status atualizado" : ""}`);
    }

    await finish(applied > 0 ? "processed" : "ignored", [...notes, ...details].join("; "), firstOrderId);
  } catch (err) {
    const message = errorMessage(err);
    log.error("webhook tracking: falha ao processar", { deliveryId, error: message });
    await finish("error", [...notes, message].join("; ")).catch(() => undefined);
  }
}

// ---------- helpers ----------

const BLOCKED_HEADER = /cookie|authorization|secret|token|password|api-?key/i;

function pickHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    const k = key.toLowerCase();
    if (BLOCKED_HEADER.test(k)) return;
    if (k === "content-type" || k === "user-agent" || k === "content-length" || k === "sign" || k.startsWith("x-") || k.startsWith("cf-")) {
      out[k] = value.slice(0, 500);
    }
  });
  return out;
}

interface DeliveryInput {
  bodyHash: string;
  headers: Record<string, string>;
  payload: unknown;
  status: WebhookDelivery["status"];
  detail: string | null;
}

/** Insere a entrega; null quando (source, bodyHash) já existia (push repetido). */
async function recordDelivery(input: DeliveryInput): Promise<WebhookDelivery | null> {
  const [row] = await db
    .insert(webhookDeliveries)
    .values({
      source: SOURCE,
      provider: PROVIDER,
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
