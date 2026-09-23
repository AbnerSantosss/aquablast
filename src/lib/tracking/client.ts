/**
 * Cliente da página /rastrear. Port em TypeScript de `site/rastrear/tracking-api.mjs`:
 * consulta (POST), normalização do snapshot, SSE com fallback para polling (recuo até 120 s),
 * pausa com a aba oculta e rejeição de revisões antigas / outro pedido.
 *
 * Só roda no navegador (usa fetch, EventSource, document). Nunca guarda o código de acesso
 * em localStorage, query string ou analytics.
 */

export const stages = ["created", "approved", "shipped", "out_for_delivery", "delivered"] as const;
export type Stage = (typeof stages)[number];

export const trackingStatuses = [...stages, "preparing", "in_transit", "exception", "cancelled"] as const;
export type TrackingStatus = (typeof trackingStatuses)[number];
const knownStatuses: ReadonlySet<string> = new Set(trackingStatuses);

export type TrackingErrorKind = "invalid" | "config" | "unavailable" | "auth" | "not_found" | "rate_limit" | "server" | "network";

export class TrackingError extends Error {
  readonly kind: TrackingErrorKind;
  constructor(kind: TrackingErrorKind, message: string) {
    super(message);
    this.name = "TrackingError";
    this.kind = kind;
  }
}

export interface TrackingEvent {
  id: string;
  title: string;
  description: string;
  occurredAt: string;
}

export interface TrackingAddress {
  line1: string;
  line2: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface TrackingOrder {
  id: string;
  revision: number;
  status: TrackingStatus;
  updatedAt: string;
  createdAt: string | null;
  approvedAt: string | null;
  shippedAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  buyer: { name: string };
  deliveryAddress: TrackingAddress;
  tracking: { code: string; carrier: string };
  events: TrackingEvent[];
}

export interface TrackingConfig {
  lookupEndpoint: string | null;
  streamEndpoint: string | null;
  pollIntervalMs: number;
  requestTimeoutMs: number;
}

/** Configuração pública. Nenhum segredo pertence a este objeto. */
export const trackingConfig: Readonly<TrackingConfig> = Object.freeze({
  lookupEndpoint: "/api/orders/lookup",
  streamEndpoint: "/api/orders/events",
  pollIntervalMs: 30_000,
  requestTimeoutMs: 12_000,
});

export type ConnectionState = "live" | "polling" | "reconnecting" | "paused";

export interface SubscribeHandlers {
  onUpdate: (order: TrackingOrder) => void;
  onConnection?: (state: ConnectionState) => void;
  onError: (error: TrackingError, fatal: boolean) => void;
}

export interface Subscription {
  stop: () => void;
  refresh: () => Promise<void>;
}

export interface TrackingClient {
  configured: boolean;
  lookup: (code: string, signal?: AbortSignal) => Promise<TrackingOrder>;
  subscribe: (code: string, initialOrder: TrackingOrder, handlers: SubscribeHandlers) => Subscription;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const clean = (value: unknown, max = 300): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

const date = (value: unknown): string | null =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

const addressKeys: (keyof TrackingAddress)[] = ["line1", "line2", "neighborhood", "city", "state", "postalCode", "country"];

/** Fronteira entre a API e a interface: rejeita estados desconhecidos e apara todos os campos. */
export function normalizeOrder(payload: unknown): TrackingOrder {
  const o = isRecord(payload) && isRecord(payload.order) ? payload.order : null;
  if (
    !o ||
    !clean(o.id, 120) ||
    typeof o.status !== "string" ||
    !knownStatuses.has(o.status) ||
    typeof o.revision !== "number" ||
    !Number.isSafeInteger(o.revision) ||
    o.revision < 0 ||
    !date(o.updatedAt)
  ) {
    throw new TrackingError("invalid", "A resposta do acompanhamento está incompleta. Tente novamente ou fale com o atendimento.");
  }
  const address = isRecord(o.deliveryAddress) ? o.deliveryAddress : {};
  const buyer = isRecord(o.buyer) ? o.buyer : {};
  const tracking = isRecord(o.tracking) ? o.tracking : {};
  const rawEvents = Array.isArray(o.events) ? (o.events as unknown[]) : [];
  const events = rawEvents
    .slice(0, 200)
    .map((event, index): TrackingEvent => {
      const e = isRecord(event) ? event : {};
      return {
        id: clean(e.id, 120) || String(index),
        title: clean(e.title, 160) || "Atualização da entrega",
        description: clean(e.description, 1000),
        occurredAt: date(e.occurredAt) ?? "",
      };
    })
    .filter((event) => event.occurredAt)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const deliveryAddress = {} as TrackingAddress;
  for (const key of addressKeys) deliveryAddress[key] = clean(address[key]);
  return {
    id: clean(o.id, 120),
    revision: o.revision,
    status: o.status as TrackingStatus,
    updatedAt: date(o.updatedAt) as string,
    createdAt: date(o.createdAt),
    approvedAt: date(o.approvedAt),
    shippedAt: date(o.shippedAt),
    outForDeliveryAt: date(o.outForDeliveryAt),
    deliveredAt: date(o.deliveredAt),
    buyer: { name: clean(buyer.name, 160) },
    deliveryAddress,
    tracking: { code: clean(tracking.code, 120), carrier: clean(tracking.carrier, 120) },
    events,
  };
}

/** Índice da etapa visível (0–4) ou -1. Ocorrência/cancelamento usam apenas as datas informadas. */
export function stageIndex(order: TrackingOrder | null): number {
  if (!order) return -1;
  if (order.status === "preparing") return 1;
  if (order.status === "in_transit") return 2;
  if (order.status === "cancelled" || order.status === "exception") {
    return order.deliveredAt ? 4 : order.outForDeliveryAt ? 3 : order.shippedAt ? 2 : order.approvedAt ? 1 : order.createdAt ? 0 : -1;
  }
  return stages.indexOf(order.status as Stage);
}

export function sameOriginEndpoint(path: string | null, base: string): string | null {
  if (!path) return null;
  const origin = new URL(base);
  const url = new URL(path, origin);
  if (url.origin !== origin.origin || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new TrackingError("config", "A configuração da consulta precisa ser revisada pelo atendimento.");
  }
  return url.href;
}

export function createTrackingClient(config: Readonly<TrackingConfig>, origin: string = window.location.origin): TrackingClient {
  const lookupUrl = sameOriginEndpoint(config.lookupEndpoint, origin);
  const streamUrl = sameOriginEndpoint(config.streamEndpoint, origin);
  const interval = Math.max(10_000, Number(config.pollIntervalMs) || 30_000);
  const timeout = Math.max(3_000, Number(config.requestTimeoutMs) || 12_000);

  async function lookup(code: string, signal?: AbortSignal): Promise<TrackingOrder> {
    if (!lookupUrl) {
      throw new TrackingError("unavailable", "A consulta integrada ainda não está disponível. Fale com o atendimento ou consulte o código da transportadora abaixo.");
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = window.setTimeout(abort, timeout);
    try {
      const response = await fetch(lookupUrl, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ code }),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new TrackingError("auth", "Acesso não autorizado ou expirado. Confira seu código de acesso ou fale com o atendimento.");
      }
      if (response.status === 404) {
        throw new TrackingError("not_found", "Não foi possível localizar o pedido com esse código. Confira a confirmação da compra.");
      }
      if (response.status === 429) {
        throw new TrackingError("rate_limit", "Muitas consultas em sequência. Aguarde um pouco antes de tentar novamente.");
      }
      if (!response.ok) {
        throw new TrackingError("server", "Não foi possível atualizar seu pedido agora. Tente novamente em instantes.");
      }
      return normalizeOrder(await response.json());
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof TrackingError) throw error;
      throw new TrackingError("network", "A conexão com o acompanhamento não respondeu. Confira sua internet e tente novamente.");
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  function subscribe(code: string, initialOrder: TrackingOrder, handlers: SubscribeHandlers): Subscription {
    let stopped = false;
    let timer: number | undefined;
    let source: EventSource | null = null;
    let controller: AbortController | null = null;
    let latest = initialOrder;
    let failures = 0;
    let streamFailures = 0;
    let streamRetry: number | undefined;
    const hidden = () => document.hidden;
    const connection = (value: ConnectionState) => {
      if (!stopped) handlers.onConnection?.(value);
    };

    function accept(order: TrackingOrder) {
      if (order.id !== initialOrder.id) throw new TrackingError("invalid", "A atualização recebida não corresponde ao pedido consultado.");
      if (order.revision <= latest.revision) return;
      latest = order;
      handlers.onUpdate(order);
    }

    function schedule() {
      window.clearTimeout(timer);
      if (!stopped && !hidden() && !source) {
        timer = window.setTimeout(() => void poll(), Math.min(interval * 2 ** failures, 120_000));
      }
    }

    async function poll(): Promise<void> {
      if (stopped || hidden() || controller) return;
      const current = new AbortController();
      controller = current;
      try {
        const order = await lookup(code, current.signal);
        if (stopped) return;
        accept(order);
        failures = 0;
        connection("polling");
      } catch (error) {
        if (stopped || current.signal.aborted) return;
        const err = error instanceof TrackingError ? error : new TrackingError("network", "A conexão com o acompanhamento não respondeu. Confira sua internet e tente novamente.");
        if (err.kind === "auth" || err.kind === "not_found") {
          stop();
          handlers.onError(err, true);
          return;
        }
        failures = Math.min(failures + 1, 3);
        connection("reconnecting");
        handlers.onError(err, false);
      } finally {
        controller = null;
        schedule();
      }
    }

    function start() {
      window.clearTimeout(streamRetry);
      if (stopped || hidden() || source) return;
      if (streamUrl && typeof EventSource !== "undefined") {
        const url = new URL(streamUrl);
        url.searchParams.set("orderId", initialOrder.id); // Identificador apenas, nunca o código de acesso.
        const es = new EventSource(url.href, { withCredentials: true });
        source = es;
        es.onopen = () => {
          streamFailures = 0;
          connection("live");
        };
        const receive = (event: MessageEvent<string>) => {
          if (stopped || hidden()) return;
          try {
            accept(normalizeOrder(JSON.parse(event.data)));
            connection("live");
          } catch (error) {
            handlers.onError(
              error instanceof TrackingError ? error : new TrackingError("invalid", "Não foi possível ler a atualização recebida."),
              false,
            );
          }
        };
        es.onmessage = receive;
        es.addEventListener("order.updated", receive as EventListener);
        es.onerror = () => {
          // Queda ou encerramento do stream (o servidor fecha após ~10 min): cai para polling
          // e tenta reabrir o SSE com recuo, até 120 s.
          es.close();
          if (source === es) source = null;
          connection("reconnecting");
          void poll();
          window.clearTimeout(streamRetry);
          if (!stopped && !hidden()) {
            streamRetry = window.setTimeout(start, Math.min(5_000 * 2 ** streamFailures, 120_000));
            streamFailures = Math.min(streamFailures + 1, 5);
          }
        };
      } else {
        connection("polling");
        schedule();
      }
    }

    function onVisibility() {
      window.clearTimeout(timer);
      window.clearTimeout(streamRetry);
      source?.close();
      source = null;
      controller?.abort();
      if (hidden()) connection("paused");
      else {
        void poll();
        start();
      }
    }

    function stop() {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(streamRetry);
      source?.close();
      source = null;
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    }

    document.addEventListener("visibilitychange", onVisibility);
    start();
    return {
      stop,
      refresh() {
        window.clearTimeout(timer);
        return poll();
      },
    };
  }

  return { configured: Boolean(lookupUrl), lookup, subscribe };
}
