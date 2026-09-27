// STUB: implementado por rastreamento (pode acrescentar campos; não remover os existentes).
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
