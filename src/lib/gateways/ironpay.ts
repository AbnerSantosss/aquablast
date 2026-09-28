import { errorMessage, log } from "@/lib/log";
import { getSetting, getSettings } from "@/lib/settings";
import type { ChargeInput, ChargeResult, Gateway, GatewayStatus, StatusResult } from "./types";

/**
 * IronPay (Fase 5.2) — contrato da seção 1.5 do plano (documentação pública da IronPay).
 * - Base: https://api.ironpayapp.com.br/api/public/v1, autenticação por `api_token` na query string.
 * - Valores em CENTAVOS. Pix e cartão em POST /transactions; consulta em GET /transactions/{hash};
 *   estorno em POST /transactions/{hash}/refund com { amount }.
 * - Postback não tem assinatura: quem recebe SEMPRE reconsulta com fetchStatus antes de mudar o pedido.
 * - NUNCA logar corpo da requisição, URL (contém o token) ou dados do cartão. Só status HTTP + orderNumber.
 */
const BASE = "https://api.ironpayapp.com.br/api/public/v1";
const TIMEOUT_MS = 20_000;

const STATUS: Record<string, GatewayStatus> = {
  pending: "pending",
  paid: "paid",
  canceled: "canceled",
  refunded: "refunded",
};

const digits = (v: string | undefined) => (v ?? "").replace(/\D/g, "");

async function creds() {
  return getSettings(["gateway.ironpay.apiToken", "gateway.ironpay.offerHashUnit", "gateway.ironpay.offerHashKit", "gateway.ironpay.productHashUnit", "gateway.ironpay.productHashKit"] as const);
}

type IronResponse = { status: number; ok: boolean; body: Record<string, unknown> | null; timedOut: boolean };

async function call(path: string, init: { method: "GET" | "POST"; body?: unknown }, token: string): Promise<IronResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}?api_token=${encodeURIComponent(token)}`, {
      method: init.method,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    let body: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await res.json();
      body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    return { status: res.status, ok: res.ok, body, timedOut: false };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    if (!timedOut) log.warn("ironpay: falha de rede", { path: path.replace(/\/[A-Za-z0-9_-]{8,}/g, "/…"), error: errorMessage(err) });
    return { status: 0, ok: false, body: null, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

/** Primeira mensagem de erro do corpo 422, sem ecoar valores enviados. */
function validationReason(body: Record<string, unknown> | null): string {
  if (!body) return "422";
  const errors = body.errors;
  if (errors && typeof errors === "object") {
    const [field, msgs] = Object.entries(errors as Record<string, unknown>)[0] ?? [];
    if (field) return `campo ${field}${Array.isArray(msgs) && typeof msgs[0] === "string" ? `: ${msgs[0].slice(0, 120)}` : ""}`;
  }
  return typeof body.message === "string" ? body.message.slice(0, 160) : "422";
}

function failure(res: IronResponse, orderNumber: string): ChargeResult {
  if (res.timedOut) return { ok: false, status: "error", transactionId: null, message: "O gateway de pagamento demorou para responder. Tente novamente.", reason: "timeout 20s" };
  if (res.status === 401) {
    log.error("ironpay: 401 (token inválido)", { orderNumber });
    return { ok: false, status: "error", transactionId: null, message: "Pagamento temporariamente indisponível. Nossa equipe já foi avisada.", reason: "401 token inválido" };
  }
  if (res.status === 422) {
    const reason = validationReason(res.body);
    log.warn("ironpay: 422", { orderNumber, reason });
    return { ok: false, status: "error", transactionId: null, message: "Não foi possível processar os dados informados. Confira e tente de novo.", reason: `422 ${reason}` };
  }
  log.warn("ironpay: resposta inesperada", { orderNumber, status: res.status });
  return { ok: false, status: "error", transactionId: null, message: "Não foi possível iniciar o pagamento. Tente novamente em instantes.", reason: `http ${res.status || "rede"}` };
}

function parseStatus(body: Record<string, unknown> | null): GatewayStatus {
  const raw = body?.payment_status ?? body?.status;
  return typeof raw === "string" ? (STATUS[raw.toLowerCase()] ?? "pending") : "pending";
}

function parsePaidAt(body: Record<string, unknown> | null): Date | null {
  const raw = body?.paid_at;
  if (typeof raw !== "string") return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * Cria uma oferta num produto da IronPay (`POST /products/{hash}/offers`, doc pública) e devolve o hash dela.
 * Existe porque a tela de produtos da IronPay não mostra o hash da oferta (só o link go.ironpayapp.com.br/…),
 * e o `offer_hash` é obrigatório em toda transação. Usado pelo botão "Criar ofertas na IronPay" do painel.
 * A doc diz `amount`, mas a API responde 422 "campo price" sem `price` (2026-09-28): manda os dois, em centavos
 * como o resto da API pública. `price` devolve o valor que a IronPay gravou, para o painel mostrar e o dono conferir.
 */
export async function createIronpayOffer(productHash: string, title: string, amountCents: number): Promise<{ ok: true; hash: string; price: string | null } | { ok: false; reason: string }> {
  const token = await getSetting("gateway.ironpay.apiToken");
  if (!token) return { ok: false, reason: "Salve o token da API da IronPay antes." };
  const res = await call(`/products/${encodeURIComponent(productHash)}/offers`, { method: "POST", body: { title, price: amountCents, amount: amountCents } }, token);
  if (res.timedOut) return { ok: false, reason: "A IronPay demorou para responder." };
  if (res.status === 401) return { ok: false, reason: "A IronPay recusou o token (401)." };
  if (res.status === 404) return { ok: false, reason: `Produto ${productHash} não encontrado na IronPay (404).` };
  if (!res.ok || !res.body) return { ok: false, reason: `A IronPay respondeu ${res.status || "erro de rede"}${res.status === 400 || res.status === 422 ? ` (${validationReason(res.body)})` : ""}.` };
  const data = res.body.data && typeof res.body.data === "object" ? (res.body.data as Record<string, unknown>) : res.body;
  const hash = typeof data.hash === "string" ? data.hash : null;
  if (!hash) return { ok: false, reason: "A IronPay respondeu sem o hash da oferta." };
  const raw = data.price ?? data.amount;
  return { ok: true, hash, price: typeof raw === "string" || typeof raw === "number" ? String(raw) : null };
}

export const ironpayGateway: Gateway = {
  name: "ironpay",
  label: "IronPay",
  supports: { pix: true, card: true },
  tokenizesCard: false,

  async configured() {
    const c = await creds();
    return !!(c["gateway.ironpay.apiToken"] && c["gateway.ironpay.offerHashUnit"] && c["gateway.ironpay.offerHashKit"] && c["gateway.ironpay.productHashUnit"] && c["gateway.ironpay.productHashKit"]);
  },

  async publicConfig() {
    return {};
  },

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const c = await creds();
    const token = c["gateway.ironpay.apiToken"];
    if (!token) return { ok: false, status: "error", transactionId: null, message: "Pagamento indisponível no momento.", reason: "ironpay sem api token" };
    if (input.method === "card" && !input.card) return { ok: false, status: "error", transactionId: null, message: "Dados do cartão não informados.", reason: "card ausente" };

    const offer = input.pack === "kit" ? c["gateway.ironpay.offerHashKit"] : c["gateway.ironpay.offerHashUnit"];
    const product = input.pack === "kit" ? c["gateway.ironpay.productHashKit"] : c["gateway.ironpay.productHashUnit"];
    const a = input.customer.address;

    const body: Record<string, unknown> = {
      amount: input.amountCents,
      offer_hash: offer,
      payment_method: input.method === "pix" ? "pix" : "credit_card",
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        phone_number: digits(input.customer.phone),
        document: digits(input.customer.document),
        ...(a
          ? { street_name: a.street, number: a.number, complement: a.extra ?? "", neighborhood: a.neighborhood, city: a.city, state: a.state, zip_code: digits(a.zip) }
          : {}),
      },
      cart: [{ product_hash: product, title: input.title, price: input.amountCents, quantity: 1, operation_type: 1, tangible: true }],
      installments: input.method === "card" ? input.installments : 1,
      expire_in_days: 1,
      transaction_origin: "api",
      postback_url: input.postbackUrl,
    };
    if (input.method === "card" && input.card) {
      body.card = {
        number: digits(input.card.number),
        holder_name: input.card.holderName,
        exp_month: input.card.expMonth,
        exp_year: input.card.expYear,
        cvv: input.card.cvv,
      };
    }

    const res = await call("/transactions", { method: "POST", body }, token);
    // `body` some daqui: nunca é logado nem devolvido.
    if (!res.ok || !res.body) return failure(res, input.orderNumber);

    const hash = typeof res.body.hash === "string" ? res.body.hash : null;
    if (!hash) {
      log.warn("ironpay: resposta sem hash", { orderNumber: input.orderNumber, status: res.status });
      return { ok: false, status: "error", transactionId: null, message: "Não foi possível iniciar o pagamento. Tente novamente.", reason: "resposta sem hash" };
    }
    const status = parseStatus(res.body);

    if (input.method === "pix") {
      const pix = res.body.pix && typeof res.body.pix === "object" ? (res.body.pix as Record<string, unknown>) : {};
      const code = typeof pix.pix_qr_code === "string" ? pix.pix_qr_code : "";
      if (!code) return { ok: false, status: "error", transactionId: hash, message: "O Pix não foi gerado. Tente novamente.", reason: "pix sem pix_qr_code" };
      return {
        ok: true,
        status,
        transactionId: hash,
        pix: { code, qrUrl: typeof pix.pix_url === "string" ? pix.pix_url : undefined, expiresAt: new Date(Date.now() + input.pixTtlSeconds * 1000) },
      };
    }

    const last4 = input.card ? digits(input.card.number).slice(-4) : input.cardLast4;
    if (status === "paid" || status === "pending") return { ok: true, status, transactionId: hash, cardBrand: input.cardBrand, cardLast4: last4 };
    return {
      ok: false,
      status: status === "canceled" ? "refused" : status,
      transactionId: hash,
      cardBrand: input.cardBrand,
      cardLast4: last4,
      message: "Pagamento não autorizado. Confira os dados do cartão ou tente outro cartão.",
      reason: `ironpay status ${status}`,
    };
  },

  async fetchStatus(transactionId): Promise<StatusResult> {
    const token = await getSetting("gateway.ironpay.apiToken");
    if (!token) return { status: "error", reason: "ironpay sem api token" };
    const res = await call(`/transactions/${encodeURIComponent(transactionId)}`, { method: "GET" }, token);
    if (!res.ok || !res.body) return { status: "error", reason: res.timedOut ? "timeout" : `http ${res.status || "rede"}` };
    return { status: parseStatus(res.body), paidAt: parsePaidAt(res.body) };
  },

  async refund(transactionId, amountCents) {
    const token = await getSetting("gateway.ironpay.apiToken");
    if (!token) return { ok: false, message: "IronPay sem token configurado." };
    const res = await call(`/transactions/${encodeURIComponent(transactionId)}/refund`, { method: "POST", body: { amount: amountCents } }, token);
    if (res.ok) return { ok: true };
    return { ok: false, message: res.timedOut ? "A IronPay demorou para responder." : `IronPay respondeu ${res.status || "erro de rede"}.` };
  },

  extractWebhook(payload) {
    const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const id = p.transaction_hash ?? p.hash;
    return { transactionId: typeof id === "string" ? id : null };
  },
};
