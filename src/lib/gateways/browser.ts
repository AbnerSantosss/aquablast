"use client";
// STUB: implementado por gateways-mp-fastpay.
// Lado do NAVEGADOR: sem import de servidor (nada de @/db, settings, env). Só tipos de ./types.
// A UI (checkout-ui) chama gatewayTokenizes(provider) e, quando true, tokenizeCard(...) antes do POST
// /api/checkout/pay, mandando { cardToken, cardBrand, cardPaymentMethodId, cardIssuerId, cardLast4 } em vez de `card`.
// `publicConfig` vem de GET /api/checkout/config (publicConfig() do gateway; ex.: { publicKey } do Mercado Pago).
// O número do cartão vai DIRETO para o gateway (SDK/API pública). Nunca para o nosso servidor, nunca em log.
import type { GatewayName } from "./types";

export interface CardForm {
  number: string;
  holderName: string;
  expMonth: number;
  expYear: number;
  cvv: string;
  holderCpf: string;
}

export interface CardTokenResult {
  token: string;
  brand?: string;
  paymentMethodId?: string;
  issuerId?: string;
}

const TOKENIZES: Record<GatewayName, boolean> = { ironpay: false, mercadopago: true, fastpay: false, simulado: false };

/** true = o cartão é tokenizado no navegador e o servidor nunca vê o número. Espelha Gateway.tokenizesCard. */
export function gatewayTokenizes(provider: GatewayName): boolean {
  return TOKENIZES[provider] ?? false;
}

export async function tokenizeCard(provider: GatewayName, publicConfig: Record<string, string>, card: CardForm, amountCents: number): Promise<CardTokenResult> {
  void publicConfig;
  void card;
  void amountCents;
  // STUB: implementado por gateways-mp-fastpay (Mercado Pago: SDK JS v2 → createCardToken + getPaymentMethods).
  throw new Error(`Tokenização de cartão ainda não implementada para ${provider}.`);
}
