// Tipos do rastreamento de anúncios (plano fase 9). Pode acrescentar campos; não remover os existentes.
// Rastreamento de anúncios 100% no servidor (decisão do dono, 2026-09-27 03h16): Meta CAPI + GA4 Measurement Protocol.
// Sem GTM, sem dataLayer, sem pixel no navegador para os eventos do checkout. O navegador só LÊ identificadores.
import type { CheckoutCart, Order } from "@/db/schema";

/** Identificadores lidos no navegador por readAdIds() e enviados junto do carrinho (cartSchema.tracking). */
export interface AdIds {
  /** Cookie _fbp. */
  fbp?: string;
  /** Cookie _fbc, ou montado a partir de ?fbclid= (fb.1.<timestamp>.<fbclid>). */
  fbc?: string;
  /** client_id do cookie _ga (parte "X.Y" final). */
  gaClientId?: string;
  /** session_id do cookie _ga_<MEASUREMENT_ID>. */
  gaSessionId?: string;
  /** ?gclid= da URL. Gravado dentro de checkout_carts.utm com a chave "gclid". */
  gclid?: string;
  /** Só chaves utm_* da URL. */
  utm?: Record<string, string>;
}

export type TrackEventName = "InitiateCheckout" | "AddPaymentInfo" | "Purchase";

/**
 * Todos os eventos de anúncio que o site gera, na ordem do funil. PageView e ViewContent saem do GTM no navegador
 * (wiki aquablast-pixel-meta); os outros três saem do servidor (TrackEventName). O painel de Pixels usa esta lista
 * para o envio de teste (um evento ou a sequência inteira).
 */
export type AdEventName = "PageView" | "ViewContent" | TrackEventName;

export const AD_EVENT_FUNNEL: readonly AdEventName[] = ["PageView", "ViewContent", "InitiateCheckout", "AddPaymentInfo", "Purchase"];

export const AD_EVENT_LABELS: Record<AdEventName, string> = {
  PageView: "PageView: visita a qualquer página",
  ViewContent: "ViewContent: viu o produto (home)",
  InitiateCheckout: "InitiateCheckout: abriu o checkout",
  AddPaymentInfo: "AddPaymentInfo: chegou no pagamento",
  Purchase: "Purchase: pagamento confirmado",
};

/** Dados de exemplo do envio de teste do painel (um produto real do catálogo, pedido fictício). */
export interface AdTestSample {
  /** Id da rodada: o mesmo em todos os eventos de uma sequência. */
  runId: string;
  sku: string;
  name: string;
  variant: string;
  priceCents: number;
}

export const isAdEventName =(v: unknown): v is AdEventName => typeof v === "string" && (AD_EVENT_FUNNEL as readonly string[]).includes(v);

export type TrackDestination = "meta" | "ga4";

export interface TrackServerEventArgs {
  name: TrackEventName;
  /**
   * Id determinístico para deduplicação (unique em conversion_events: destination + eventName + eventId):
   * InitiateCheckout → `ic-<cart.token>`, AddPaymentInfo → `api-<cart.token>`, Purchase → `pur-<order.orderNumber>`.
   */
  eventId: string;
  cart?: CheckoutCart;
  order?: Order;
}

export interface TrackResult {
  destination: TrackDestination;
  status: "sent" | "error" | "skipped";
  detail?: string;
}
