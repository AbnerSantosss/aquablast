// STUB: implementado por rastreamento.
// SÓ SERVIDOR. Contrato (plano 9.6): trackServerEvent nunca lança e nunca derruba a rota que chamou.
// Implementação final:
//   1. Respeita consentimento: cart.consent / order.trackingConsent false (e ads.consentRequired true) → grava "skipped".
//   2. Para cada destino ligado (ads.meta.enabled / ads.ga4.enabled) insere em conversion_events com
//      onConflictDoNothing na unique (destination, eventName, eventId); se já existia, NÃO reenvia.
//   3. Envia via sendMetaEvent (meta-capi.ts) / sendGa4Event (ga4-mp.ts) e atualiza status/detail da linha.
//   4. Purchase leva value/currency BRL/content_ids (sku)/num_items; e-mail, telefone, CPF hasheados (sha256Hex) no Meta.
// Quem chama:
//   - POST /api/checkout/cart: InitiateCheckout quando upsertCart devolve created=true; AddPaymentInfo quando step === "pagamento".
//   - Todo ponto em que applyPaymentStatus devolve becamePaid=true (pay, postback, cron de reconsulta, admin): Purchase.
import type { TrackResult, TrackServerEventArgs } from "./types";

export async function trackServerEvent(args: TrackServerEventArgs): Promise<void> {
  void args; // STUB: implementado por rastreamento
}

/** Versão que devolve o resultado por destino (para o painel/diagnóstico). trackServerEvent usa esta por baixo. */
export async function trackServerEventDetailed(args: TrackServerEventArgs): Promise<TrackResult[]> {
  void args; // STUB: implementado por rastreamento
  return [];
}
