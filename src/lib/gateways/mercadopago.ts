import { createHmac, timingSafeEqual } from "node:crypto";
import { errorMessage, log } from "@/lib/log";
import { getSettings } from "@/lib/settings";
import type { ChargeInput, ChargeResult, Gateway, GatewayStatus, StatusResult } from "./types";

/**
 * Mercado Pago — Checkout Transparente (API de pagamentos v1). Contrato em `01 - Site Pronto/PLANO-GATEWAY-MERCADOPAGO.md`.
 * - `POST https://api.mercadopago.com/v1/payments` com `Authorization: Bearer <accessToken>` e `X-Idempotency-Key`.
 * - Valores em REAIS (`transaction_amount: 159.9`), não centavos.
 * - Pix: `payment_method_id: "pix"`; copia-e-cola em `point_of_interaction.transaction_data.qr_code`.
 * - Cartão: SEMPRE por token criado no navegador (browser.ts → mp.createCardToken). O número nunca chega aqui.
 * - Consulta: `GET /v1/payments/{id}`. Estorno: `POST /v1/payments/{id}/refunds` com `{ amount }` (até 180 dias).
 * - Webhook: `x-signature` (ts + v1) validado com HMAC-SHA256 do manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
 *   Mesmo com assinatura válida, quem recebe reconsulta com fetchStatus (o corpo não traz status confiável).
 * - Log: nunca corpo, URL com token, token de cartão ou CPF. Só orderNumber, status HTTP e status do pagamento.
 */
const BASE = "https://api.mercadopago.com";
const TIMEOUT_MS = 20_000;

const STATUS: Record<string, GatewayStatus> = {
  approved: "paid",
  authorized: "pending",
  in_process: "pending",
  pending: "pending",
  in_mediation: "pending",
  rejected: "refused",
  cancelled: "canceled",
  refunded: "refunded",
  charged_back: "refunded",
};

/** Motivos de recusa que aparecem literalmente na documentação do MP. O resto cai na mensagem genérica. */
const REFUSAL_MESSAGES: Record<string, string> = {
  cc_rejected_bad_filled_card_number: "O número do cartão parece incorreto. Confira e tente de novo.",
  cc_rejected_insufficient_amount: "O cartão não tem limite suficiente. Tente outro cartão ou pague com Pix.",
  cc_rejected_high_risk: "O pagamento não foi aprovado pela análise de segurança. Tente outro cartão ou pague com Pix.",
};
const GENERIC_REFUSAL = "Pagamento não autorizado. Confira os dados do cartão, tente outro cartão ou pague com Pix.";

const digits = (v: string | undefined) => (v ?? "").replace(/\D/g, "");
const toReais = (cents: number) => Math.round(cents) / 100;

async function creds() {
  return getSettings(["gateway.mercadopago.accessToken", "gateway.mercadopago.publicKey", "gateway.mercadopago.webhookSecret"] as const);
}

type MpResponse = { status: number; ok: boolean; body: Record<string, unknown> | null; timedOut: boolean };

async function call(path: string, init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string }, accessToken: string): Promise<MpResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };
    if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;
    const res = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    let body: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await res.json();
      body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    return { status: res.status, ok: res.ok, body, timedOut: false };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    if (!timedOut) log.warn("mercadopago: falha de rede", { path: path.replace(/\/\d{4,}/g, "/…"), error: errorMessage(err) });
    return { status: 0, ok: false, body: null, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);

function parseStatus(body: Record<string, unknown> | null): GatewayStatus {
  const raw = body?.status;
  return typeof raw === "string" ? (STATUS[raw.toLowerCase()] ?? "error") : "error";
}

function statusDetail(body: Record<string, unknown> | null): string {
  const d = body?.status_detail;
  return typeof d === "string" ? d.slice(0, 80) : "";
}

/** Mensagem curta de erro 4xx, sem ecoar valores enviados. */
function apiReason(body: Record<string, unknown> | null): string {
  if (!body) return "";
  const cause = Array.isArray(body.cause) ? (body.cause[0] as Record<string, unknown> | undefined) : undefined;
  const code = str(cause?.code);
  const msg = typeof body.message === "string" ? body.message.slice(0, 120) : "";
  return [code ? `cause ${code}` : "", msg].filter(Boolean).join(" ");
}

function failure(res: MpResponse, orderNumber: string): ChargeResult {
  if (res.timedOut) return { ok: false, status: "error", transactionId: null, message: "O gateway de pagamento demorou para responder. Tente novamente.", reason: "timeout 20s" };
  if (res.status === 401 || res.status === 403) {
    log.error("mercadopago: credencial recusada", { orderNumber, status: res.status });
    return { ok: false, status: "error", transactionId: null, message: "Pagamento temporariamente indisponível. Nossa equipe já foi avisada.", reason: `${res.status} credencial recusada` };
  }
  if (res.status === 400 || res.status === 422) {
    const reason = apiReason(res.body);
    log.warn("mercadopago: dados recusados", { orderNumber, status: res.status, reason });
    return { ok: false, status: "error", transactionId: null, message: "Não foi possível processar os dados informados. Confira e tente de novo.", reason: `${res.status} ${reason}`.trim() };
  }
  log.warn("mercadopago: resposta inesperada", { orderNumber, status: res.status });
  return { ok: false, status: "error", transactionId: null, message: "Não foi possível iniciar o pagamento. Tente novamente em instantes.", reason: `http ${res.status || "rede"}` };
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  const first = parts.shift() ?? "";
  return { first, last: parts.join(" ") };
}

/** O MP só aceita notification_url pública em https (em dev, localhost fica de fora e o status vem por consulta). */
function notificationUrl(url: string): string | undefined {
  return /^https:\/\//i.test(url) ? url : undefined;
}

function payer(input: ChargeInput): Record<string, unknown> {
  const { first, last } = splitName(input.customer.name);
  const a = input.customer.address;
  return {
    email: input.customer.email,
    first_name: first,
    last_name: last,
    identification: { type: "CPF", number: digits(input.customer.document) },
    ...(a && input.method === "pix"
      ? { address: { zip_code: digits(a.zip), street_name: a.street, street_number: a.number, neighborhood: a.neighborhood, city: a.city, federal_unit: a.state } }
      : {}),
  };
}

export const mercadopagoGateway: Gateway = {
  name: "mercadopago",
  label: "Mercado Pago",
  supports: { pix: true, card: true },
  tokenizesCard: true,

  async configured() {
    const c = await creds();
    // webhookSecret é exigido: sem ele o postback do MP não pode ser validado e o Pix pago só apareceria por consulta.
    return !!(c["gateway.mercadopago.accessToken"] && c["gateway.mercadopago.publicKey"] && c["gateway.mercadopago.webhookSecret"]);
  },

  async publicConfig(): Promise<Record<string, string>> {
    const c = await creds();
    return c["gateway.mercadopago.publicKey"] ? { publicKey: c["gateway.mercadopago.publicKey"] } : {};
  },

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const c = await creds();
    const accessToken = c["gateway.mercadopago.accessToken"];
    if (!accessToken) return { ok: false, status: "error", transactionId: null, message: "Pagamento indisponível no momento.", reason: "mercadopago sem access token" };
    if (input.card) {
      // Trava: o MP tokeniza no navegador. Se o número chegou aqui, algo está errado na tela; não enviamos.
      log.error("mercadopago: cartão em claro recebido no servidor (recusado)", { orderNumber: input.orderNumber });
      return { ok: false, status: "error", transactionId: null, message: "Não foi possível processar o cartão. Atualize a página e tente de novo.", reason: "cartão em claro recusado (MP exige token)" };
    }

    const description = `${input.title} - pedido ${input.orderNumber}`.slice(0, 250);
    const notify = notificationUrl(input.postbackUrl);
    let body: Record<string, unknown>;

    if (input.method === "pix") {
      body = {
        transaction_amount: toReais(input.amountCents),
        description,
        payment_method_id: "pix",
        payer: payer(input),
        ...(notify ? { notification_url: notify } : {}),
        // date_of_expiration fica de fora: o MP exige no mínimo 30 min e usa 24 h por padrão.
        // O cronômetro de pixTtlSeconds é só da tela (mesma regra da IronPay, D10).
      };
    } else {
      if (!input.cardToken || !input.cardPaymentMethodId) {
        return { ok: false, status: "error", transactionId: null, message: "Dados do cartão não informados.", reason: "cardToken/payment_method_id ausente" };
      }
      const issuer = input.cardIssuerId && /^\d+$/.test(input.cardIssuerId) ? Number(input.cardIssuerId) : undefined;
      body = {
        transaction_amount: toReais(input.amountCents),
        token: input.cardToken,
        description,
        installments: input.installments,
        payment_method_id: input.cardPaymentMethodId,
        ...(issuer !== undefined ? { issuer_id: issuer } : {}),
        payer: payer(input),
        ...(notify ? { notification_url: notify } : {}),
      };
    }

    const res = await call("/v1/payments", { method: "POST", body, idempotencyKey: input.idempotencyKey }, accessToken);
    // `body` (com token do cartão e CPF) some daqui: nunca é logado nem devolvido.
    if (!res.ok || !res.body) return failure(res, input.orderNumber);

    const id = str(res.body.id);
    if (!id) {
      log.warn("mercadopago: resposta sem id", { orderNumber: input.orderNumber, status: res.status });
      return { ok: false, status: "error", transactionId: null, message: "Não foi possível iniciar o pagamento. Tente novamente.", reason: "resposta sem id" };
    }
    const status = parseStatus(res.body);
    const detail = statusDetail(res.body);

    if (input.method === "pix") {
      const poi = res.body.point_of_interaction && typeof res.body.point_of_interaction === "object" ? (res.body.point_of_interaction as Record<string, unknown>) : {};
      const td = poi.transaction_data && typeof poi.transaction_data === "object" ? (poi.transaction_data as Record<string, unknown>) : {};
      const code = typeof td.qr_code === "string" ? td.qr_code : "";
      if (!code) return { ok: false, status: "error", transactionId: id, message: "O Pix não foi gerado. Tente novamente.", reason: `pix sem qr_code (${detail || status})` };
      const b64 = typeof td.qr_code_base64 === "string" && td.qr_code_base64 ? `data:image/png;base64,${td.qr_code_base64}` : undefined;
      return {
        ok: true,
        status: status === "error" ? "pending" : status,
        transactionId: id,
        pix: { code, qrUrl: b64, expiresAt: new Date(Date.now() + input.pixTtlSeconds * 1000) },
        reason: detail || undefined,
      };
    }

    const brand = input.cardBrand ?? input.cardPaymentMethodId;
    if (status === "paid" || status === "pending") {
      return { ok: true, status, transactionId: id, cardBrand: brand, cardLast4: input.cardLast4, reason: detail || undefined };
    }
    log.info("mercadopago: cartão não aprovado", { orderNumber: input.orderNumber, status, detail });
    return {
      ok: false,
      status: status === "error" || status === "canceled" ? "refused" : status,
      transactionId: id,
      cardBrand: brand,
      cardLast4: input.cardLast4,
      message: REFUSAL_MESSAGES[detail] ?? GENERIC_REFUSAL,
      reason: `mercadopago ${status}${detail ? ` ${detail}` : ""}`,
    };
  },

  async fetchStatus(transactionId): Promise<StatusResult> {
    const { "gateway.mercadopago.accessToken": accessToken } = await creds();
    if (!accessToken) return { status: "error", reason: "mercadopago sem access token" };
    if (!/^\d+$/.test(transactionId)) return { status: "error", reason: "id de pagamento inválido" };
    const res = await call(`/v1/payments/${transactionId}`, { method: "GET" }, accessToken);
    if (!res.ok || !res.body) return { status: "error", reason: res.timedOut ? "timeout" : `http ${res.status || "rede"}` };
    const status = parseStatus(res.body);
    const detail = statusDetail(res.body);
    // paidAt fica null: o campo de data de aprovação não foi confirmado na documentação (quem aplica usa a hora atual).
    return { status, paidAt: null, reason: [typeof res.body.status === "string" ? res.body.status : "", detail].filter(Boolean).join(" ") || undefined };
  },

  async refund(transactionId, amountCents) {
    const { "gateway.mercadopago.accessToken": accessToken } = await creds();
    if (!accessToken) return { ok: false, message: "Mercado Pago sem access token configurado." };
    if (!/^\d+$/.test(transactionId)) return { ok: false, message: "Id de pagamento do Mercado Pago inválido." };
    if (!Number.isInteger(amountCents) || amountCents <= 0) return { ok: false, message: "Valor de estorno inválido." };
    const res = await call(
      `/v1/payments/${transactionId}/refunds`,
      { method: "POST", body: { amount: toReais(amountCents) }, idempotencyKey: `refund-${transactionId}-${amountCents}` },
      accessToken,
    );
    if (res.ok) return { ok: true };
    if (res.timedOut) return { ok: false, message: "O Mercado Pago demorou para responder. Confira o estorno no painel do Mercado Pago antes de tentar de novo." };
    const reason = apiReason(res.body);
    log.warn("mercadopago: estorno recusado", { status: res.status, reason });
    return { ok: false, message: `Mercado Pago respondeu ${res.status || "erro de rede"}${reason ? `: ${reason}` : ""}.` };
  },

  extractWebhook(payload, url) {
    // O MP manda ?data.id=<id>&type=payment na URL e { data: { id } } no corpo.
    const fromUrl = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const type = typeof p.type === "string" ? p.type : url.searchParams.get("type") ?? url.searchParams.get("topic");
    if (type && type !== "payment") return { transactionId: null };
    const data = p.data && typeof p.data === "object" ? (p.data as Record<string, unknown>) : {};
    const id = str(data.id) ?? fromUrl;
    return { transactionId: id && /^\d+$/.test(id) ? id : null };
  },

  async verifyWebhook({ headers, url }) {
    const { "gateway.mercadopago.webhookSecret": secret } = await creds();
    if (!secret) return false;
    const sig = headers.get("x-signature") ?? "";
    let ts = "";
    let v1 = "";
    for (const part of sig.split(",")) {
      const [k, v] = part.split("=", 2).map((s) => s?.trim() ?? "");
      if (k === "ts") ts = v;
      else if (k === "v1") v1 = v;
    }
    if (!ts || !/^[0-9a-f]{64}$/i.test(v1)) return false;

    const rawId = url.searchParams.get("data.id") ?? "";
    const dataId = /^[a-z0-9]+$/i.test(rawId) ? rawId.toLowerCase() : rawId;
    const requestId = headers.get("x-request-id") ?? "";
    // Manifest da documentação; partes sem valor são removidas.
    const manifest = [dataId ? `id:${dataId};` : "", requestId ? `request-id:${requestId};` : "", `ts:${ts};`].join("");
    const expected = createHmac("sha256", secret).update(manifest).digest();
    const got = Buffer.from(v1, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  },
};
