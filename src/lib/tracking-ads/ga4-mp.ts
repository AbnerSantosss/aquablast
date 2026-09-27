import { errorMessage } from "@/lib/log";
import { getSettings } from "@/lib/settings";
import type { TrackEventName } from "./types";

/**
 * GA4 Measurement Protocol (plano 9.5). SÓ SERVIDOR.
 * Envio:     POST https://www.google-analytics.com/mp/collect?measurement_id=<G-...>&api_secret=<segredo>
 * Validação: POST https://www.google-analytics.com/debug/mp/collect?... (devolve validationMessages; não grava nada).
 * Regras:
 * - Sem client_id (cookie _ga, só com consentimento) → NÃO envia. Nunca inventa client_id para evento real.
 * - Nenhum dado pessoal (nome, e-mail, telefone, CPF, endereço) vai para o GA4.
 * - purchase leva transaction_id = número do pedido (o GA4 deduplica purchase por ele).
 * - O api_secret nunca aparece em log, detalhe ou exceção.
 * - O /mp/collect responde 2xx mesmo para evento malformado: por isso existe validateGa4Event().
 */

const TIMEOUT_MS = 10_000;

export const GA4_EVENT_NAMES: Record<TrackEventName, string> = {
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
};

export interface Ga4EventInput {
  eventName: TrackEventName;
  eventId: string;
  clientId: string;
  sessionId?: string;
  transactionId?: string;
  valueCents?: number;
  items?: { itemId: string; itemName: string; quantity: number; priceCents: number; itemVariant?: string }[];
  /** Hora do evento (padrão: agora). O GA4 aceita até 72 h para trás. */
  eventTime?: Date;
}

export interface Ga4ValidationMessage {
  fieldPath?: string;
  description?: string;
  validationCode?: string;
}

const reais = (cents: number) => Math.round(cents) / 100;

/** Corpo do Measurement Protocol (sem segredo). */
export function buildGa4Body(input: Ga4EventInput): Record<string, unknown> {
  const params: Record<string, unknown> = { currency: "BRL", engagement_time_msec: 1 };
  if (typeof input.valueCents === "number") params.value = reais(input.valueCents);
  if (input.transactionId) params.transaction_id = input.transactionId;
  if (input.sessionId?.trim()) params.session_id = input.sessionId.trim();
  if (input.items?.length) {
    params.items = input.items.map((i) => {
      const item: Record<string, unknown> = { item_id: i.itemId, item_name: i.itemName, price: reais(i.priceCents), quantity: i.quantity };
      if (i.itemVariant) item.item_variant = i.itemVariant;
      return item;
    });
  }
  const when = input.eventTime ?? new Date();
  return {
    client_id: input.clientId,
    timestamp_micros: when.getTime() * 1000,
    events: [{ name: GA4_EVENT_NAMES[input.eventName], params }],
  };
}

interface Ga4Config {
  measurementId: string;
  apiSecret: string;
}

async function ga4Config(): Promise<Ga4Config> {
  const s = await getSettings(["ads.ga4.measurementId", "ads.ga4.apiSecret"] as const);
  return { measurementId: String(s["ads.ga4.measurementId"] ?? "").trim(), apiSecret: String(s["ads.ga4.apiSecret"] ?? "").trim() };
}

function scrubSecret(text: string, secret: string): string {
  let t = text;
  if (secret) t = t.split(secret).join("***");
  return t.replace(/api_secret=[^&\s"]+/gi, "api_secret=***").slice(0, 500);
}

function configProblem(cfg: Ga4Config): string | null {
  if (!/^G-[A-Z0-9]{4,20}$/i.test(cfg.measurementId)) return "GA4: ID de medição vazio ou inválido no painel (formato G-XXXXXXX)";
  if (!cfg.apiSecret) return "GA4: segredo da API não configurado no painel";
  return null;
}

async function post(cfg: Ga4Config, body: Record<string, unknown>, debug: boolean): Promise<{ status: number; text: string }> {
  const url = new URL(`https://www.google-analytics.com/${debug ? "debug/mp/collect" : "mp/collect"}`);
  url.searchParams.set("measurement_id", cfg.measurementId);
  url.searchParams.set("api_secret", cfg.apiSecret);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  return { status: res.status, text: await res.text() };
}

function networkDetail(err: unknown, secret: string): string {
  const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
  return scrubSecret(timeout ? `GA4: sem resposta em ${TIMEOUT_MS / 1000} s` : `GA4: falha de rede (${errorMessage(err)})`, secret);
}

/** Envia um evento para o GA4. Nunca lança. Sem client_id → { ok: false } sem chamar a rede. */
export async function sendGa4Event(input: Ga4EventInput): Promise<{ ok: boolean; detail?: string }> {
  if (!input.clientId?.trim()) return { ok: false, detail: "GA4: sem client_id (cookie _ga ausente ou sem consentimento)" };
  let cfg: Ga4Config = { measurementId: "", apiSecret: "" };
  try {
    cfg = await ga4Config();
    const problem = configProblem(cfg);
    if (problem) return { ok: false, detail: problem };
    const { status, text } = await post(cfg, buildGa4Body(input), false);
    if (status >= 200 && status < 300) return { ok: true, detail: `GA4 HTTP ${status}` };
    return { ok: false, detail: scrubSecret(`GA4 HTTP ${status}: ${text.slice(0, 200)}`, cfg.apiSecret) };
  } catch (err) {
    return { ok: false, detail: networkDetail(err, cfg.apiSecret) };
  }
}

/**
 * Botão "Enviar evento de teste" do painel de Pixels (plano 11.10) e testes da Fase 14:
 * manda o evento para o endpoint de VALIDAÇÃO (debug/mp/collect), que não grava nada no GA4,
 * e devolve as validationMessages. Sem `input`, valida um purchase de exemplo com client_id fictício
 * (permitido só aqui, porque o endpoint de validação não registra dados).
 */
export async function validateGa4Event(input?: Ga4EventInput): Promise<{ ok: boolean; detail?: string; messages: Ga4ValidationMessage[] }> {
  let cfg: Ga4Config = { measurementId: "", apiSecret: "" };
  try {
    cfg = await ga4Config();
    const problem = configProblem(cfg);
    if (problem) return { ok: false, detail: problem, messages: [] };
    const sample: Ga4EventInput = input ?? {
      eventName: "Purchase",
      eventId: "pur-TESTE",
      clientId: "1234567890.1234567890",
      transactionId: "TESTE-PAINEL",
      valueCents: 100,
      items: [{ itemId: "AQB-TESTE", itemName: "Evento de teste do painel", quantity: 1, priceCents: 100 }],
    };
    const { status, text } = await post(cfg, buildGa4Body(sample), true);
    let messages: Ga4ValidationMessage[] = [];
    try {
      const json = JSON.parse(text) as { validationMessages?: Ga4ValidationMessage[] };
      messages = Array.isArray(json.validationMessages) ? json.validationMessages : [];
    } catch {
      messages = [];
    }
    if (status < 200 || status >= 300) return { ok: false, detail: scrubSecret(`GA4 validação HTTP ${status}: ${text.slice(0, 200)}`, cfg.apiSecret), messages };
    const detail = messages.length
      ? scrubSecret(`GA4 validação: ${messages.map((m) => `${m.fieldPath ?? "?"}: ${m.description ?? m.validationCode ?? ""}`).join(" | ")}`, cfg.apiSecret)
      : "GA4 validação: evento aceito, sem mensagens de erro";
    return { ok: messages.length === 0, detail, messages };
  } catch (err) {
    return { ok: false, detail: networkDetail(err, cfg.apiSecret), messages: [] };
  }
}
