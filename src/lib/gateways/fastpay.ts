// STUB: implementado por gateways-mp-fastpay.
// Contrato final: Gateway de ./types. Ainda não existem chaves gateway.fastpay.* em src/lib/settings.ts:
// o agente gateways-mp-fastpay adiciona as chaves (com os nomes exatos da documentação da FastPay) e
// decide tokenizesCard conforme a API. Nunca inventar campos que não estejam documentados.
import type { Gateway } from "./types";

const NOT_READY = "FastPay ainda não está disponível neste checkout.";

export const fastpayGateway: Gateway = {
  name: "fastpay",
  label: "FastPay",
  supports: { pix: true, card: true },
  tokenizesCard: false,

  async configured() {
    return false; // STUB: implementado por gateways-mp-fastpay
  },

  async publicConfig() {
    return {};
  },

  async charge() {
    return { ok: false, status: "error", transactionId: null, message: NOT_READY, reason: "fastpay não implementado" };
  },

  async fetchStatus() {
    return { status: "error", reason: "fastpay não implementado" };
  },

  async refund() {
    return { ok: false, message: NOT_READY };
  },

  extractWebhook() {
    return { transactionId: null }; // STUB: implementado por gateways-mp-fastpay
  },
};
