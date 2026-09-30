import { isIP } from "node:net";
import { sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/log";
import { getSettings } from "@/lib/settings";
import { effectiveTestEventCode, metaRequestBody } from "./meta-body";
import type { AdEventName, AdTestSample } from "./types";

/**
 * Meta Conversions API (plano 9.4). SÓ SERVIDOR.
 * POST https://graph.facebook.com/<versão>/<pixelId>/events?access_token=<ads.meta.accessToken>
 * Regras:
 * - Dados pessoais vão normalizados + SHA-256 (sha256Hex). CPF NUNCA é enviado, nem com hash.
 * - client_ip_address, client_user_agent, fbp e fbc vão SEM hash (é o que a Meta exige).
 * - Campo vazio é omitido (nunca manda hash de string vazia).
 * - test_event_code só vai junto dos eventos reais com o checkbox "Enviar como evento de teste"
 *   (ads.meta.testMode) ligado E o código preenchido (meta-body.ts). O código pode ficar salvo em produção.
 *   "Testar envio" (sendMetaTestEvents) sempre usa o código.
 * - O access token nunca aparece em log, detalhe ou exceção (scrubSecret).
 * - Timeout de 10 s. Quem chama (dispatch.ts) trata falha como "error" e nunca derruba a compra.
 */

/** Versão da Graph API. Trocar aqui quando a Meta descontinuar esta. */
export const META_GRAPH_VERSION = "v25.0";

const TIMEOUT_MS = 10_000;

export interface MetaHashedUserData {
  email?: string;
  phone?: string;
  externalId?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface MetaEventInput {
  eventName: AdEventName;
  eventId: string;
  eventTime: Date;
  sourceUrl?: string;
  /** Já hasheados (sha256Hex de valor normalizado). Use hashMetaUserData() para montar. */
  hashed: MetaHashedUserData;
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  userAgent?: string;
  valueCents?: number;
  contentIds?: string[];
  numItems?: number;
  /** Número do pedido (só Purchase). */
  orderId?: string;
  /** Itens para custom_data.contents. */
  contents?: { id: string; quantity: number; itemPriceCents: number }[];
  /** utm_* da visita que virou a compra (só Purchase). Vão em custom_data como parâmetros próprios. */
  utm?: Record<string, string>;
}

export interface MetaSendResult {
  ok: boolean;
  detail?: string;
  /** events_received devolvido pela Meta (0 quando falhou). */
  received?: number;
  /** Corpo enviado (data + test_event_code). Não contém o token, que vai na URL. Mostrado no painel. */
  payload?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ normalização + hash */

/** Minúsculas, sem acento, só letras a-z (regra da Meta para fn/ln/ct). */
function lettersOnly(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

/** Telefone brasileiro só com dígitos e DDI 55 na frente. Curto demais → vazio. */
export function normalizeBrPhone(v: string): string {
  let d = digitsOnly(v).replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 && d.startsWith("55") ? d : "";
}

function hashIf(v: string | null | undefined): string | undefined {
  const s = (v ?? "").trim();
  return s ? sha256Hex(s) : undefined;
}

/** Dados crus do comprador (nunca CPF). */
export interface MetaRawUserData {
  email?: string | null;
  phone?: string | null;
  /** Nome completo: a 1ª palavra vira fn e a última vira ln. */
  name?: string | null;
  city?: string | null;
  /** UF de 2 letras. */
  state?: string | null;
  /** CEP. */
  zip?: string | null;
  /** Código ISO de 2 letras. Padrão "br". */
  country?: string | null;
  /** Identificador estável do comprador no nosso sistema (id do carrinho). */
  externalId?: string | null;
}

/** Normaliza cada campo como a Meta pede e aplica SHA-256. Campos vazios ficam de fora. */
export function hashMetaUserData(raw: MetaRawUserData): MetaHashedUserData {
  const words = (raw.name ?? "").trim().split(/\s+/).filter(Boolean);
  const fn = words.length ? lettersOnly(words[0]) : "";
  const ln = words.length > 1 ? lettersOnly(words[words.length - 1]) : "";
  const st = lettersOnly(raw.state ?? "");
  const country = lettersOnly(raw.country ?? "br");
  const out: MetaHashedUserData = {
    email: hashIf((raw.email ?? "").trim().toLowerCase()),
    phone: hashIf(normalizeBrPhone(raw.phone ?? "")),
    firstName: hashIf(fn),
    lastName: hashIf(ln),
    city: hashIf(lettersOnly(raw.city ?? "")),
    state: hashIf(st.length === 2 ? st : ""),
    zip: hashIf(digitsOnly(raw.zip ?? "")),
    country: hashIf(country.length === 2 ? country : ""),
    externalId: hashIf(raw.externalId ?? ""),
  };
  for (const k of Object.keys(out) as (keyof MetaHashedUserData)[]) if (!out[k]) delete out[k];
  return out;
}

/* ------------------------------------------------------------------ corpo */

type MetaUserData = Record<string, string | string[]>;

function userDataOf(input: MetaEventInput): MetaUserData {
  const h = input.hashed;
  const ud: MetaUserData = {};
  const put = (key: string, v: string | undefined) => {
    if (v) ud[key] = [v];
  };
  put("em", h.email);
  put("ph", h.phone);
  put("fn", h.firstName);
  put("ln", h.lastName);
  put("ct", h.city);
  put("st", h.state);
  put("zp", h.zip);
  put("country", h.country);
  put("external_id", h.externalId);
  const ip = input.clientIp?.trim();
  if (ip && isIP(ip)) ud.client_ip_address = ip;
  if (input.userAgent?.trim()) ud.client_user_agent = input.userAgent.trim();
  if (input.fbp?.trim()) ud.fbp = input.fbp.trim();
  if (input.fbc?.trim()) ud.fbc = input.fbc.trim();
  return ud;
}

const reais = (cents: number) => Math.round(cents) / 100;

/** Monta o objeto `data[0]` da CAPI. Exportado para diagnóstico/teste (não contém token). */
export function buildMetaEvent(input: MetaEventInput): Record<string, unknown> {
  const custom: Record<string, unknown> = { currency: "BRL" };
  if (typeof input.valueCents === "number") custom.value = reais(input.valueCents);
  if (input.orderId) custom.order_id = input.orderId;
  if (input.contentIds?.length) {
    custom.content_type = "product";
    custom.content_ids = input.contentIds;
  }
  if (input.contents?.length) custom.contents = input.contents.map((c) => ({ id: c.id, quantity: c.quantity, item_price: reais(c.itemPriceCents) }));
  if (typeof input.numItems === "number") custom.num_items = input.numItems;
  for (const [k, v] of Object.entries(input.utm ?? {})) if (/^utm_[a-z_]{1,30}$/.test(k) && v && !(k in custom)) custom[k] = v.slice(0, 200);

  const ev: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: Math.floor(input.eventTime.getTime() / 1000),
    event_id: input.eventId,
    action_source: "website",
    event_source_url: input.sourceUrl || defaultSourceUrl(),
    user_data: userDataOf(input),
    custom_data: custom,
  };
  return ev;
}

export function defaultSourceUrl(path = "/checkout"): string {
  try {
    return new URL(path, env().APP_URL).toString();
  } catch {
    return path;
  }
}

/* ------------------------------------------------------------------ envio */

interface MetaConfig {
  pixelId: string;
  accessToken: string;
  testEventCode: string;
  testMode: boolean;
}

async function metaConfig(): Promise<MetaConfig> {
  const s = await getSettings(["ads.meta.pixelId", "ads.meta.accessToken", "ads.meta.testEventCode", "ads.meta.testMode"] as const);
  return {
    pixelId: String(s["ads.meta.pixelId"] ?? "").trim(),
    accessToken: String(s["ads.meta.accessToken"] ?? "").trim(),
    testEventCode: String(s["ads.meta.testEventCode"] ?? "").trim(),
    testMode: s["ads.meta.testMode"] === true,
  };
}

/** Tira o token de qualquer texto que vá para log/detalhe/painel. */
function scrubSecret(text: string, secret: string): string {
  let t = text;
  if (secret) t = t.split(secret).join("***");
  return t.replace(/access_token=[^&\s"]+/gi, "access_token=***").slice(0, 500);
}

interface MetaApiResponse {
  events_received?: number;
  messages?: unknown[];
  fbtrace_id?: string;
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; error_user_msg?: string; fbtrace_id?: string };
}

async function postEvents(cfg: MetaConfig, events: Record<string, unknown>[], testEventCode: string): Promise<MetaSendResult> {
  if (!/^\d{5,25}$/.test(cfg.pixelId)) return { ok: false, detail: "Meta: Pixel ID vazio ou inválido no painel" };
  if (!cfg.accessToken) return { ok: false, detail: "Meta: token de acesso não configurado no painel" };

  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${cfg.pixelId}/events`);
  url.searchParams.set("access_token", cfg.accessToken);
  const body = metaRequestBody(events, testEventCode);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const text = await res.text();
    let json: MetaApiResponse = {};
    try {
      json = text ? (JSON.parse(text) as MetaApiResponse) : {};
    } catch {
      json = {};
    }
    const test = testEventCode ? " (com test_event_code)" : "";
    if (!res.ok || json.error) {
      const e = json.error;
      const msg = e ? `${e.message ?? "erro"}${e.code ? ` [code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""}]` : ""}${e.fbtrace_id ? ` fbtrace ${e.fbtrace_id}` : ""}` : text.slice(0, 200);
      return { ok: false, detail: scrubSecret(`Meta HTTP ${res.status}: ${msg}${test}`, cfg.accessToken), payload: body };
    }
    const received = typeof json.events_received === "number" ? json.events_received : 0;
    const detail = `Meta HTTP ${res.status}: events_received=${received}${json.fbtrace_id ? ` fbtrace ${json.fbtrace_id}` : ""}${test}`;
    return { ok: received > 0, detail: scrubSecret(detail, cfg.accessToken), received, payload: body };
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, detail: scrubSecret(timeout ? `Meta: sem resposta em ${TIMEOUT_MS / 1000} s` : `Meta: falha de rede (${errorMessage(err)})`, cfg.accessToken), payload: body };
  }
}

/** Envia um evento para a CAPI. Nunca lança. */
export async function sendMetaEvent(input: MetaEventInput): Promise<MetaSendResult> {
  try {
    const cfg = await metaConfig();
    return await postEvents(cfg, [buildMetaEvent(input)], effectiveTestEventCode(cfg));
  } catch (err) {
    return { ok: false, detail: `Meta: ${errorMessage(err)}`.slice(0, 500) };
  }
}

/** Evento de teste no formato de um evento real do site (mesmos campos que o GTM/servidor mandam). */
function testEventInput(name: AdEventName, i: number, total: number, sample: AdTestSample, base: Pick<MetaEventInput, "hashed" | "clientIp" | "userAgent">): MetaEventInput {
  const onSite = name === "PageView" || name === "ViewContent";
  const input: MetaEventInput = {
    ...base,
    eventName: name,
    eventId: `test-${sample.runId}-${name}`,
    // Um segundo entre os eventos, na ordem do funil, e nunca no futuro (a Meta recusa).
    eventTime: new Date(Date.now() - (total - 1 - i) * 1000),
    sourceUrl: defaultSourceUrl(onSite ? "/" : "/checkout"),
  };
  if (name === "PageView") return input;
  input.valueCents = sample.priceCents;
  input.contentIds = [sample.sku];
  if (name === "ViewContent") return input;
  input.contents = [{ id: sample.sku, quantity: 1, itemPriceCents: sample.priceCents }];
  input.numItems = 1;
  if (name === "Purchase") input.orderId = `TESTE-${sample.runId}`;
  return input;
}

/**
 * Botão "Enviar teste" do painel de Pixels: manda para a Meta um evento escolhido ou a sequência do funil
 * (PageView → ViewContent → InitiateCheckout → AddPaymentInfo → Purchase), num só POST, SEMPRE com test_event_code
 * (o passado em `testEventCode` ou, vazio, o salvo no painel). Aparece em Gerenciador de Eventos → Eventos de teste.
 * Não grava em conversion_events. ok só quando a Meta recebeu todos os eventos enviados.
 */
export async function sendMetaTestEvents(opts: {
  events: readonly AdEventName[];
  sample: AdTestSample;
  clientIp?: string;
  userAgent?: string;
  testEventCode?: string;
}): Promise<MetaSendResult> {
  try {
    const cfg = await metaConfig();
    const code = (opts.testEventCode || cfg.testEventCode).trim();
    if (!code) return { ok: false, detail: "Preencha o código de teste (Gerenciador de Eventos → Eventos de teste) antes de enviar." };
    if (!opts.events.length) return { ok: false, detail: "Escolha um evento." };
    const base = {
      hashed: hashMetaUserData({ externalId: `painel-teste-${opts.sample.runId}`, country: "br" }),
      clientIp: opts.clientIp,
      userAgent: opts.userAgent?.trim() || "AquaBlast painel (evento de teste)",
    };
    const total = opts.events.length;
    const events = opts.events.map((name, i) => buildMetaEvent(testEventInput(name, i, total, opts.sample, base)));
    const r = await postEvents(cfg, events, code);
    const received = r.received ?? 0;
    const names = opts.events.join(" → ");
    return { ok: r.ok && received === total, detail: `${names}. ${r.detail ?? ""}`.trim().slice(0, 500), received };
  } catch (err) {
    return { ok: false, detail: `Meta: ${errorMessage(err)}`.slice(0, 500) };
  }
}

/**
 * "(#100) Missing Permission" (ou code 10/200) no GET do pixel: o token não pode LER o pixel, o que não diz
 * se ele pode ENVIAR eventos. Visto em 2026-09-30 com o token gerado para a API de Conversões.
 * Token inválido/vencido vem com code 190 e continua sendo falha.
 */
function isReadPermissionError(e: { message?: string; code?: number }): boolean {
  return e.code === 10 || e.code === 200 || (e.code === 100 && /missing permission/i.test(e.message ?? ""));
}

/**
 * Plano B do Verificar: com código de teste salvo, manda 1 PageView com test_event_code (aparece em
 * Eventos de teste) e dá ok se a Meta recebeu. Sem código, não envia nada e diz o que fazer.
 */
async function verifyBySending(cfg: MetaConfig): Promise<{ ok: boolean; message: string }> {
  if (!cfg.testEventCode) {
    return { ok: false, message: "o token não pode ler o pixel; preencha o código de evento de teste e salve de novo para testar o envio" };
  }
  const runId = Date.now().toString(36);
  const event = buildMetaEvent({
    eventName: "PageView",
    eventId: `verificar-${runId}`,
    eventTime: new Date(),
    sourceUrl: defaultSourceUrl("/"),
    hashed: hashMetaUserData({ externalId: `painel-verificar-${runId}`, country: "br" }),
    userAgent: "AquaBlast painel (verificar token)",
  });
  const r = await postEvents(cfg, [event], cfg.testEventCode);
  if (r.ok) return { ok: true, message: `envio confirmado: 1 evento de teste chegou (${cfg.testEventCode})` };
  return { ok: false, message: scrubSecret(`o envio também falhou: ${r.detail ?? "sem detalhe"}`, cfg.accessToken).slice(0, 150) };
}

/**
 * "Verificar" do token no painel de Pixels: GET /<versão>/<pixelId>?fields=id,name (só leitura, não envia evento).
 * Token vai no header Authorization (não na URL). A mensagem nunca contém o token; no sucesso traz o nome do pixel.
 */
export async function verifyMetaConnection(): Promise<{ ok: boolean; message: string }> {
  let token = "";
  try {
    const cfg = await metaConfig();
    token = cfg.accessToken;
    if (!/^\d{5,25}$/.test(cfg.pixelId)) return { ok: false, message: "Pixel ID vazio ou inválido" };
    if (!cfg.accessToken) return { ok: false, message: "token não configurado" };
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${cfg.pixelId}`);
    url.searchParams.set("fields", "id,name");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    let json: { id?: string; name?: string; error?: { message?: string; code?: number } } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      json = {};
    }
    if (!res.ok || json.error || json.id !== cfg.pixelId) {
      const e = json.error;
      if (e && isReadPermissionError(e)) return await verifyBySending(cfg);
      const why = e ? `${e.message ?? "erro"}${e.code ? ` [code ${e.code}]` : ""}` : `HTTP ${res.status}`;
      return { ok: false, message: scrubSecret(`Meta recusou: ${why}`, token).slice(0, 150) };
    }
    return { ok: true, message: json.name ? `pixel "${json.name.slice(0, 60)}"` : "pixel encontrado" };
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, message: scrubSecret(timeout ? `sem resposta em ${TIMEOUT_MS / 1000} s` : `falha de rede (${errorMessage(err)})`, token).slice(0, 150) };
  }
}
