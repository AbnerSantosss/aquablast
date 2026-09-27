import { errorMessage, log } from "@/lib/log";
import { getSetting } from "@/lib/settings";
import type { ChargeInput, ChargeResult, Gateway, GatewayStatus, StatusResult } from "./types";

/**
 * FastPay — API v1 (spec OpenAPI da documentação oficial, lida em 2026-09-27).
 * - Base `https://api-global.fastpaybrasil.com`, `Authorization: Basic base64("<apiKey>:")`. A mesma URL serve teste e produção.
 * - `POST /v1/charges` com valores em REAIS (`amount: 159.9`), `currency: "BRL"`.
 * - Pix: `paymentMethod { type: "pix", expirationInDays }` → copia-e-cola em `paymentDetails.copyPaste`.
 * - Cartão: `paymentMethod { type: "credit_card", number, holderName, expirationMonth "MM", expirationYear "AAAA", cvv, installments }`.
 *   A FastPay NÃO tem tokenização de navegador (o `cardTokenId` da API é de cartão salvo): o número passa pelo
 *   NOSSO servidor, só em memória, direto para a FastPay. Nunca logado, nunca gravado (travas da Fase 6 na rota pay).
 * - Não há GET por id: a consulta varre `GET /v1/charges` (paginado, mais recentes primeiro) procurando o id.
 * - Não há estorno por API nem assinatura de webhook documentados: o postback só serve de gatilho e o status
 *   é sempre reconsultado.
 * - Status da API: paid | pending | refused | failed (failed vira refused aqui).
 * - Log: nunca corpo, chave, dados de cartão ou CPF.
 */
const BASE = "https://api-global.fastpaybrasil.com";
const TIMEOUT_MS = 20_000;
/** Consulta por varredura: até LIST_PAGES páginas de LIST_SIZE (valor do exemplo da documentação). */
const LIST_SIZE = 20;
const LIST_PAGES = 5;

const STATUS: Record<string, GatewayStatus> = {
  paid: "paid",
  pending: "pending",
  refused: "refused",
  failed: "refused",
};

const digits = (v: string | undefined) => (v ?? "").replace(/\D/g, "");
const toReais = (cents: number) => Math.round(cents) / 100;

type FpResponse = { status: number; ok: boolean; body: Record<string, unknown> | null; timedOut: boolean };

async function call(path: string, init: { method: "GET" | "POST"; body?: unknown }, apiKey: string): Promise<FpResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      },
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
    if (!timedOut) log.warn("fastpay: falha de rede", { path: path.split("?")[0], error: errorMessage(err) });
    return { status: 0, ok: false, body: null, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);

function parseStatus(raw: unknown): GatewayStatus {
  return typeof raw === "string" ? (STATUS[raw.toLowerCase()] ?? "error") : "error";
}

/** Mensagem curta de erro (`{ statusCode, message }`), sem ecoar valores enviados. */
function apiReason(body: Record<string, unknown> | null): string {
  const m = body?.message;
  if (typeof m === "string") return m.slice(0, 160);
  if (Array.isArray(m)) return m.filter((x) => typeof x === "string").join("; ").slice(0, 160);
  return "";
}

function failure(res: FpResponse, orderNumber: string): ChargeResult {
  if (res.timedOut) return { ok: false, status: "error", transactionId: null, message: "O gateway de pagamento demorou para responder. Tente novamente.", reason: "timeout 20s" };
  if (res.status === 401 || res.status === 403) {
    log.error("fastpay: credencial recusada", { orderNumber, status: res.status });
    return { ok: false, status: "error", transactionId: null, message: "Pagamento temporariamente indisponível. Nossa equipe já foi avisada.", reason: `${res.status} credencial recusada` };
  }
  if (res.status === 400 || res.status === 422) {
    const reason = apiReason(res.body);
    log.warn("fastpay: dados recusados", { orderNumber, status: res.status, reason });
    return { ok: false, status: "error", transactionId: null, message: "Não foi possível processar os dados informados. Confira e tente de novo.", reason: `${res.status} ${reason}`.trim() };
  }
  log.warn("fastpay: resposta inesperada", { orderNumber, status: res.status });
  return { ok: false, status: "error", transactionId: null, message: "Não foi possível iniciar o pagamento. Tente novamente em instantes.", reason: `http ${res.status || "rede"}` };
}

function buildBody(input: ChargeInput, attempt: string): Record<string, unknown> {
  const c = input.customer;
  const a = c.address;
  const amount = toReais(input.amountCents);
  const body: Record<string, unknown> = {
    amount,
    currency: "BRL",
    customer: {
      name: c.name,
      email: c.email,
      phone: digits(c.phone),
      document: { type: "cpf", id: digits(c.document) },
      address: { country: "BRA" },
      ...(input.clientIp ? { ipAddress: input.clientIp } : {}),
    },
    items: [{ title: input.title, type: "physical", description: `${input.title} (${input.sku})`, unit_price: amount, quantity: 1 }],
    metadata: { order_id: input.orderNumber, attempt },
    ...(/^https:\/\//i.test(input.postbackUrl) ? { postbackUrl: input.postbackUrl } : {}),
  };
  if (a) {
    body.shippingAddress = {
      postalCode: digits(a.zip),
      addressLine1: `${a.street}, ${a.number}`,
      addressLine2: a.extra?.trim() || "-",
      neighborhood: a.neighborhood,
      city: a.city,
      state: a.state,
      country: "BRA",
    };
  }
  return body;
}

export const fastpayGateway: Gateway = {
  name: "fastpay",
  label: "FastPay",
  supports: { pix: true, card: true },
  tokenizesCard: false,

  async configured() {
    return !!(await getSetting("gateway.fastpay.apiKey"));
  },

  async publicConfig() {
    return {};
  },

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const apiKey = await getSetting("gateway.fastpay.apiKey");
    if (!apiKey) return { ok: false, status: "error", transactionId: null, message: "Pagamento indisponível no momento.", reason: "fastpay sem api key" };

    // A API não documenta idempotência: a chave vai em metadata só para rastrear a tentativa no painel da FastPay.
    const body = buildBody(input, input.idempotencyKey);
    if (input.method === "pix") {
      body.paymentMethod = { type: "pix", expirationInDays: 1 };
    } else {
      const card = input.card;
      if (!card) return { ok: false, status: "error", transactionId: null, message: "Dados do cartão não informados.", reason: "cartão ausente" };
      body.paymentMethod = {
        type: "credit_card",
        number: card.number.replace(/\D/g, ""),
        holderName: card.holderName.trim(),
        expirationMonth: String(card.expMonth).padStart(2, "0"),
        expirationYear: String(card.expYear < 100 ? 2000 + card.expYear : card.expYear),
        cvv: card.cvv,
        installments: input.installments,
      };
    }

    const res = await call("/v1/charges", { method: "POST", body }, apiKey);
    // Descarta a referência ao corpo (tem dados de cartão): nunca logado nem devolvido.
    delete body.paymentMethod;
    if (!res.ok || !res.body) return failure(res, input.orderNumber);

    const id = str(res.body.id);
    if (!id) {
      log.warn("fastpay: resposta sem id", { orderNumber: input.orderNumber, status: res.status });
      return { ok: false, status: "error", transactionId: null, message: "Não foi possível iniciar o pagamento. Tente novamente.", reason: "resposta sem id" };
    }
    const status = parseStatus(res.body.status);
    const details = obj(res.body.paymentDetails);
    const apiMsg = str(res.body.reason)?.slice(0, 160);

    if (input.method === "pix") {
      const code = typeof details.copyPaste === "string" ? details.copyPaste : "";
      if (!code) return { ok: false, status: "error", transactionId: id, message: "O Pix não foi gerado. Tente novamente.", reason: `pix sem copyPaste (${apiMsg ?? status})` };
      return {
        ok: true,
        status: status === "error" ? "pending" : status,
        transactionId: id,
        // A FastPay mede validade em dias; o cronômetro de pixTtlSeconds é só da tela (D10).
        pix: { code, expiresAt: new Date(Date.now() + input.pixTtlSeconds * 1000) },
      };
    }

    const last4 = str(details.lastFour) ?? input.cardLast4;
    if (status === "paid" || status === "pending") return { ok: true, status, transactionId: id, cardLast4: last4 ?? undefined, reason: apiMsg };
    log.info("fastpay: cartão não aprovado", { orderNumber: input.orderNumber, status: str(res.body.status) });
    return {
      ok: false,
      status: "refused",
      transactionId: id,
      cardLast4: last4 ?? undefined,
      message: "Pagamento não autorizado. Confira os dados do cartão, tente outro cartão ou pague com Pix.",
      reason: `fastpay ${str(res.body.status) ?? "sem status"}${apiMsg ? ` ${apiMsg}` : ""}`,
    };
  },

  async fetchStatus(transactionId): Promise<StatusResult> {
    const apiKey = await getSetting("gateway.fastpay.apiKey");
    if (!apiKey) return { status: "error", reason: "fastpay sem api key" };
    for (let page = 1; page <= LIST_PAGES; page++) {
      const res = await call(`/v1/charges?page=${page}&size=${LIST_SIZE}&orderBy=-createdAt`, { method: "GET" }, apiKey);
      if (!res.ok || !res.body) return { status: "error", reason: res.timedOut ? "timeout" : `http ${res.status || "rede"}` };
      const data = Array.isArray(res.body.data) ? res.body.data : [];
      for (const item of data) {
        const it = obj(item);
        if (str(it.id) !== transactionId) continue;
        const status = parseStatus(it.status);
        const paidRaw = typeof it.paidAt === "string" ? new Date(it.paidAt) : null;
        const paidAt = paidRaw && !Number.isNaN(paidRaw.getTime()) ? paidRaw : null;
        return { status, paidAt, reason: str(it.status) ?? undefined };
      }
      const pages = typeof res.body.pages === "number" ? res.body.pages : page;
      if (data.length === 0 || page >= pages) break;
    }
    return { status: "error", reason: `cobrança não encontrada nas ${LIST_PAGES * LIST_SIZE} mais recentes` };
  },

  async refund() {
    return { ok: false, message: "A FastPay não oferece estorno por API. Faça o estorno pelo painel da FastPay e marque no admin." };
  },

  extractWebhook(payload) {
    // Postback: { id: "evt_...", event: "charge.paid" | ..., data: { id, status, ... } }. Sem assinatura: só gatilho de reconsulta.
    const data = obj(obj(payload).data);
    const id = str(data.id);
    return { transactionId: id && id.length <= 64 ? id : null };
  },
};
