import type { OrderStatus } from "@/db/schema";
import { getSettings, type TrackingProviderKind } from "@/lib/settings";

/** Evento normalizado da transportadora. */
export interface CarrierEvent {
  /** Chave estável para deduplicar (hash de tempo+descrição). */
  key: string;
  occurredAt: Date;
  title: string;
  description: string;
  location?: string;
  status?: OrderStatus | null;
}

export interface TrackingSnapshot {
  provider: TrackingProviderKind;
  code: string;
  carrierCode: string | null;
  carrierName: string | null;
  /** Status agregado mais recente, já traduzido para o enum público. */
  status: OrderStatus | null;
  rawStatus: string | null;
  events: CarrierEvent[];
  raw?: unknown;
}

export interface TrackingProvider {
  kind: TrackingProviderKind;
  /** Registra o código para receber webhooks. Idempotente. */
  register(code: string, carrierCode?: number | null, orderNumber?: string): Promise<{ ok: boolean; carrierCode: number | null; message?: string }>;
  /** Busca o histórico atual. */
  fetch(code: string, carrierCode?: number | null): Promise<TrackingSnapshot | null>;
  /** Normaliza o corpo de um webhook do provedor em snapshots. */
  parseWebhook(body: unknown): TrackingSnapshot[];
}

/** Transportadoras oferecidas no painel (código 17TRACK). */
export const CARRIERS: { code: number; name: string; url?: (t: string) => string }[] = [
  { code: 101332, name: "Shopee Express (SPX)", url: (t) => `https://spx.com.br/track?${encodeURIComponent(t)}` },
  { code: 2151, name: "Correios", url: (t) => `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(t)}` },
  { code: 100797, name: "J&T Express", url: (t) => `https://www.jtexpress.com.br/trajectoryQuery?waybillNo=${encodeURIComponent(t)}` },
  { code: 101052, name: "Jadlog", url: (t) => `https://www.jadlog.com.br/siteInstitucional/tracking_dev.jad?cte=${encodeURIComponent(t)}` },
  { code: 100457, name: "Loggi", url: (t) => `https://www.loggi.com/rastreador/${encodeURIComponent(t)}` },
  { code: 100887, name: "Kangu" },
  { code: 101415, name: "Total Express" },
];

export function carrierName(code: number | string | null | undefined): string | null {
  if (code === null || code === undefined || code === "") return null;
  return CARRIERS.find((c) => c.code === Number(code))?.name ?? null;
}

export function carrierUrl(code: number | string | null | undefined, tracking: string): string {
  const c = CARRIERS.find((x) => x.code === Number(code));
  return c?.url?.(tracking) ?? `https://t.17track.net/pt#nums=${encodeURIComponent(tracking)}`;
}

// ---------- Mapeamento de status do 17TRACK ----------

const STATUS_MAP: Record<string, OrderStatus | null> = {
  NotFound: null,
  InfoReceived: "shipped",
  InTransit: "in_transit",
  Expired: "exception",
  AvailableForPickup: "out_for_delivery",
  OutForDelivery: "out_for_delivery",
  DeliveryFailure: "exception",
  Delivered: "delivered",
  Exception: "exception",
};

const STAGE_TITLE: Record<string, string> = {
  InfoReceived: "Objeto postado",
  PickedUp: "Coletado pela transportadora",
  Departure: "Saiu da unidade",
  Arrival: "Chegou na unidade",
  AvailableForPickup: "Disponível para retirada",
  OutForDelivery: "Saiu para entrega",
  Delivered: "Entregue",
  Returning: "Em devolução",
  Returned: "Devolvido",
};

export function map17Status(status: string | null | undefined): OrderStatus | null {
  if (!status) return null;
  return STATUS_MAP[status] ?? null;
}

type T17Event = { time_iso?: string; time_utc?: string; description?: string; location?: string; stage?: string | null; sub_status?: string };
type T17Accepted = {
  number: string;
  carrier?: number;
  track_info?: {
    latest_status?: { status?: string; sub_status?: string };
    latest_event?: { time_iso?: string; description?: string };
    tracking?: { providers?: { provider?: { key?: number; name?: string }; events?: T17Event[] }[] };
  };
};

function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function eventStatusFromStage(stage: string | null | undefined, sub: string | undefined): OrderStatus | null {
  if (stage && STAGE_TITLE[stage]) {
    if (stage === "Delivered") return "delivered";
    if (stage === "OutForDelivery" || stage === "AvailableForPickup") return "out_for_delivery";
    if (stage === "InfoReceived") return "shipped";
    if (stage === "Returning" || stage === "Returned") return "exception";
    return "in_transit";
  }
  if (sub?.startsWith("Exception") || sub?.startsWith("DeliveryFailure")) return "exception";
  return null;
}

function snapshotFromAccepted(a: T17Accepted, raw?: unknown): TrackingSnapshot {
  const providers = a.track_info?.tracking?.providers ?? [];
  const events: CarrierEvent[] = [];
  for (const p of providers) {
    for (const e of p.events ?? []) {
      const when = e.time_iso ?? e.time_utc;
      if (!when) continue;
      const desc = (e.description ?? "").trim();
      events.push({
        key: hashKey(`${when}|${desc}|${e.location ?? ""}`),
        occurredAt: new Date(when),
        title: (e.stage && STAGE_TITLE[e.stage]) || "Atualização da transportadora",
        description: e.location ? `${desc} — ${e.location}` : desc,
        location: e.location,
        status: eventStatusFromStage(e.stage, e.sub_status),
      });
    }
  }
  events.sort((x, y) => x.occurredAt.getTime() - y.occurredAt.getTime());
  const rawStatus = a.track_info?.latest_status?.status ?? null;
  const providerName = providers[0]?.provider?.name ?? null;
  return {
    provider: "17track",
    code: a.number,
    carrierCode: a.carrier != null ? String(a.carrier) : null,
    carrierName: carrierName(a.carrier) ?? providerName,
    status: map17Status(rawStatus),
    rawStatus,
    events,
    raw,
  };
}

function seventeenTrack(apiKey: string): TrackingProvider {
  const base = "https://api.17track.net/track/v2.2";
  async function call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "17token": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`17TRACK ${path} ${res.status}`);
    return (await res.json()) as T;
  }
  type RegisterRes = { code: number; data?: { accepted?: { number: string; carrier?: number }[]; rejected?: { number: string; error?: { code?: number; message?: string } }[] } };
  type InfoRes = { code: number; data?: { accepted?: T17Accepted[]; rejected?: { number: string; error?: { code?: number; message?: string } }[] } };

  return {
    kind: "17track",
    async register(code, carrierCode, orderNumber) {
      const item: Record<string, unknown> = { number: code };
      if (carrierCode) item.carrier = carrierCode;
      if (orderNumber) item.order_no = orderNumber;
      const r = await call<RegisterRes>("/register", [item]);
      const acc = r.data?.accepted?.[0];
      if (acc) return { ok: true, carrierCode: acc.carrier ?? carrierCode ?? null };
      const rej = r.data?.rejected?.[0];
      // -18019901 = já registrado: tratar como sucesso (idempotente).
      if (rej?.error?.code === -18019901) return { ok: true, carrierCode: carrierCode ?? null, message: "já registrado" };
      return { ok: false, carrierCode: carrierCode ?? null, message: rej?.error?.message ?? `código ${rej?.error?.code ?? "?"}` };
    },
    async fetch(code, carrierCode) {
      const item: Record<string, unknown> = { number: code };
      if (carrierCode) item.carrier = carrierCode;
      const r = await call<InfoRes>("/gettrackinfo", [item]);
      const acc = r.data?.accepted?.[0];
      if (!acc) return null;
      return snapshotFromAccepted(acc, r);
    },
    parseWebhook(body) {
      const b = body as { event?: string; data?: T17Accepted | { accepted?: T17Accepted[] } };
      if (!b || typeof b !== "object") return [];
      const data = b.data as (T17Accepted & { accepted?: T17Accepted[] }) | undefined;
      if (!data) return [];
      const list: T17Accepted[] = Array.isArray(data.accepted) ? data.accepted : data.number ? [data] : [];
      return list.map((a) => snapshotFromAccepted(a, body));
    },
  };
}

const manual: TrackingProvider = {
  kind: "manual",
  async register(_code, carrierCode) {
    return { ok: true, carrierCode: carrierCode ?? null, message: "modo manual: sem registro externo" };
  },
  async fetch() {
    return null;
  },
  parseWebhook() {
    return [];
  },
};

export async function getTrackingProvider(): Promise<TrackingProvider> {
  const s = await getSettings(["tracking.provider", "tracking.17track.apiKey"] as const);
  if (s["tracking.provider"] === "17track") {
    if (!s["tracking.17track.apiKey"]) throw new Error("Chave do 17TRACK não configurada (Configurações → Rastreio).");
    return seventeenTrack(s["tracking.17track.apiKey"]);
  }
  return manual;
}
