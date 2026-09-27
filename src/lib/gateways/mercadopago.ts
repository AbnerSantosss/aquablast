// STUB: implementado por gateways-mp-fastpay.
// Contrato final: Gateway de ./types. Mercado Pago tokeniza o cartão no navegador (tokenizesCard: true),
// então charge() recebe input.cardToken / cardPaymentMethodId / cardIssuerId, nunca input.card.
// Credenciais no painel: gateway.mercadopago.accessToken (secret), gateway.mercadopago.publicKey (pública,
// vai em publicConfig()), gateway.mercadopago.webhookSecret (secret, valida x-signature em verifyWebhook).
// Idempotência: header X-Idempotency-Key = input.idempotencyKey.
import type { Gateway } from "./types";

const NOT_READY = "Mercado Pago ainda não está disponível neste checkout.";

export const mercadopagoGateway: Gateway = {
  name: "mercadopago",
  label: "Mercado Pago",
  supports: { pix: true, card: true },
  tokenizesCard: true,

  async configured() {
    return false; // STUB: implementado por gateways-mp-fastpay (accessToken + publicKey preenchidos)
  },

  async publicConfig() {
    return {}; // STUB: implementado por gateways-mp-fastpay → { publicKey }
  },

  async charge() {
    return { ok: false, status: "error", transactionId: null, message: NOT_READY, reason: "mercadopago não implementado" };
  },

  async fetchStatus() {
    return { status: "error", reason: "mercadopago não implementado" };
  },

  async refund() {
    return { ok: false, message: NOT_READY };
  },

  extractWebhook(payload, url) {
    // STUB: implementado por gateways-mp-fastpay. MP manda ?data.id=<id>&type=payment na URL e { data: { id } } no corpo.
    const fromUrl = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const data = p.data && typeof p.data === "object" ? (p.data as Record<string, unknown>) : {};
    const id = data.id ?? fromUrl;
    return { transactionId: typeof id === "string" || typeof id === "number" ? String(id) : null };
  },

  async verifyWebhook() {
    return false; // STUB: implementado por gateways-mp-fastpay (HMAC-SHA256 do x-signature com webhookSecret)
  },
};
