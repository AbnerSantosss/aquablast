// STUB: implementado por rastreamento.
// SÓ SERVIDOR. GA4 Measurement Protocol: POST https://www.google-analytics.com/mp/collect?measurement_id=<ads.ga4.measurementId>&api_secret=<ads.ga4.apiSecret>
// com { client_id, events: [{ name: begin_checkout | add_payment_info | purchase, params: { transaction_id, value, currency: "BRL",
// items: [{ item_id: sku, item_name, quantity, price }], session_id? } ] }. Nunca logar o api_secret.
// Sem gaClientId (sem consentimento ou sem cookie _ga) → não envia; grava "skipped" em conversion_events.
import type { TrackEventName } from "./types";

export interface Ga4EventInput {
  eventName: TrackEventName;
  eventId: string;
  clientId: string;
  sessionId?: string;
  transactionId?: string;
  valueCents?: number;
  items?: { itemId: string; itemName: string; quantity: number; priceCents: number }[];
}

export async function sendGa4Event(input: Ga4EventInput): Promise<{ ok: boolean; detail?: string }> {
  void input; // STUB: implementado por rastreamento
  return { ok: false, detail: "ga4-mp não implementado" };
}
