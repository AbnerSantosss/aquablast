"use client";
// Lado do NAVEGADOR: sem import de servidor (nada de @/db, settings, env). Só tipos de ./types.
// A UI (checkout-ui) chama gatewayTokenizes(provider) e, quando true, tokenizeCard(...) antes do POST
// /api/checkout/pay, mandando { cardToken, cardBrand, cardPaymentMethodId, cardIssuerId, cardLast4 } em vez de `card`.
// `publicConfig` vem de GET /api/checkout/config (publicConfig() do gateway; ex.: { publicKey } do Mercado Pago).
// O número do cartão vai DIRETO para o gateway (SDK/API pública). Nunca para o nosso servidor, nunca em log.
//
// Mercado Pago: SDK JS v2 (https://sdk.mercadopago.com/js/v2), métodos "core" documentados em
// github.com/mercadopago/sdk-js/docs/core-methods.md: getPaymentMethods({ bin }) e createCardToken({...}).
// A CSP do site precisa liberar sdk.mercadopago.com (script) e os domínios de API do MP (connect/frame).
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

/* ---------- Mercado Pago SDK v2 (tipos mínimos, só o que usamos) ---------- */

interface MpPaymentMethod {
  id?: string;
  payment_type_id?: string;
  issuer?: { id?: number | string };
}

interface MpInstance {
  getPaymentMethods(args: { bin: string }): Promise<{ results?: MpPaymentMethod[] }>;
  createCardToken(args: {
    cardNumber: string;
    cardholderName: string;
    cardExpirationMonth: string;
    cardExpirationYear: string;
    securityCode: string;
    identificationType: string;
    identificationNumber: string;
  }): Promise<{ id?: string }>;
}

type MpConstructor = new (publicKey: string, options?: { locale?: string }) => MpInstance;

declare global {
  interface Window {
    MercadoPago?: MpConstructor;
  }
}

const MP_SDK_URL = "https://sdk.mercadopago.com/js/v2";
let sdkPromise: Promise<MpConstructor> | null = null;
const instances = new Map<string, MpInstance>();

function loadMpSdk(): Promise<MpConstructor> {
  if (typeof window === "undefined") return Promise.reject(new Error("Pagamento com cartão indisponível neste ambiente."));
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<MpConstructor>((resolve, reject) => {
    const fail = () => {
      sdkPromise = null;
      reject(new Error("Não foi possível carregar o pagamento com cartão. Verifique sua conexão e tente de novo."));
    };
    const timer = window.setTimeout(fail, 20_000);
    const script = document.createElement("script");
    script.src = MP_SDK_URL;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.MercadoPago) resolve(window.MercadoPago);
      else fail();
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      script.remove();
      fail();
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

async function mpInstance(publicKey: string): Promise<MpInstance> {
  const cached = instances.get(publicKey);
  if (cached) return cached;
  const MercadoPago = await loadMpSdk();
  const mp = new MercadoPago(publicKey, { locale: "pt-BR" });
  instances.set(publicKey, mp);
  return mp;
}

async function tokenizeMercadoPago(publicConfig: Record<string, string>, card: CardForm): Promise<CardTokenResult> {
  const publicKey = publicConfig.publicKey;
  if (!publicKey) throw new Error("Pagamento com cartão indisponível no momento.");

  const number = card.number.replace(/\D/g, "");
  const cpf = card.holderCpf.replace(/\D/g, "");
  if (number.length < 13 || number.length > 19) throw new Error("Número do cartão inválido.");
  if (cpf.length !== 11) throw new Error("CPF do titular inválido.");
  const month = String(card.expMonth).padStart(2, "0");
  const year = String(card.expYear < 100 ? 2000 + card.expYear : card.expYear);

  const mp = await mpInstance(publicKey);

  let method: MpPaymentMethod | undefined;
  try {
    const found = await mp.getPaymentMethods({ bin: number.slice(0, 8) });
    method = found.results?.find((m) => m.payment_type_id === "credit_card") ?? found.results?.[0];
  } catch {
    throw new Error("Não foi possível identificar a bandeira do cartão. Confira o número e tente de novo.");
  }
  if (!method?.id) throw new Error("Bandeira do cartão não aceita. Tente outro cartão ou pague com Pix.");

  let tokenId: string | undefined;
  try {
    const token = await mp.createCardToken({
      cardNumber: number,
      cardholderName: card.holderName.trim(),
      cardExpirationMonth: month,
      cardExpirationYear: year,
      securityCode: card.cvv.replace(/\D/g, ""),
      identificationType: "CPF",
      identificationNumber: cpf,
    });
    tokenId = token.id;
  } catch {
    // A mensagem do SDK pode citar campos do cartão: não é repassada.
    throw new Error("Não foi possível validar os dados do cartão. Confira número, validade, CVV e nome.");
  }
  if (!tokenId) throw new Error("Não foi possível validar os dados do cartão. Tente de novo.");

  const issuer = method.issuer?.id;
  return {
    token: tokenId,
    brand: method.id,
    paymentMethodId: method.id,
    issuerId: issuer !== undefined && issuer !== null ? String(issuer) : undefined,
  };
}

export async function tokenizeCard(provider: GatewayName, publicConfig: Record<string, string>, card: CardForm, amountCents: number): Promise<CardTokenResult> {
  void amountCents; // o token do MP não depende do valor; parcelas são enviadas no pagamento.
  if (provider === "mercadopago") return tokenizeMercadoPago(publicConfig, card);
  throw new Error("Este meio de pagamento não usa tokenização no navegador.");
}
