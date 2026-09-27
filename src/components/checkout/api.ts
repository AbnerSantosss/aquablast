"use client";

import type { CardFormData } from "./types";
import type { CartResponse, PayResponse } from "./types";

/**
 * Chamadas do checkout ao próprio backend (POST /api/checkout/cart e /api/checkout/pay). Centralizado
 * aqui para não duplicar o parse de erro em StepDados/StepEntrega/StepPagamento/PixPay/CardPay/Checkout.
 * Nunca envia número de cartão/CVV em claro quando o gateway tokeniza (isso é decidido por quem chama).
 */

export interface ApiFail {
  ok: false;
  error: string;
  field?: string;
}

export type CartStep = "dados" | "entrega" | "pagamento";

export interface CartSelectionInput {
  pack: "unit" | "kit";
  colors: string[];
}

export interface CartTrackingInput {
  consent: boolean;
  fbp?: string;
  fbc?: string;
  gaClientId?: string;
  gaSessionId?: string;
  gclid?: string;
  utm?: Record<string, string>;
}

export interface CartPayload {
  token?: string;
  selection: CartSelectionInput;
  step: CartStep;
  bump: boolean;
  customer?: { name: string; email: string; phone: string; cpf: string };
  address?: { cep: string; street: string; number: string; extra?: string; district: string; city: string; state: string; recipient: string };
  tracking?: CartTrackingInput;
}

async function parseJson<T>(res: Response): Promise<T | ApiFail> {
  try {
    return (await res.json()) as T | ApiFail;
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente de novo." };
  }
}

export async function postCart(payload: CartPayload): Promise<CartResponse | ApiFail> {
  try {
    const res = await fetch("/api/checkout/cart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await parseJson<CartResponse>(res);
  } catch {
    return { ok: false, error: "Sem conexão com o servidor. Verifique sua internet e tente de novo." };
  }
}

export interface PayPayload {
  cartToken: string;
  method: "pix" | "card";
  installments: number;
  bump: boolean;
  card?: CardFormData;
  cardToken?: string;
  cardBrand?: string;
  cardPaymentMethodId?: string;
  cardIssuerId?: string;
  cardLast4?: string;
}

export async function postPay(payload: PayPayload): Promise<PayResponse | ApiFail> {
  try {
    const res = await fetch("/api/checkout/pay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await parseJson<PayResponse>(res);
  } catch {
    return { ok: false, error: "Sem conexão com o servidor. Verifique sua internet e tente de novo.", status: "error", orderNumber: null, publicToken: null, pix: null, message: null };
  }
}

export interface StatusResponse {
  ok: true;
  status: "pending" | "paid" | "refused" | "canceled";
  orderNumber: string;
}

export async function getStatus(publicToken: string): Promise<StatusResponse | ApiFail> {
  try {
    const res = await fetch(`/api/checkout/status/${publicToken}`, { cache: "no-store" });
    return await parseJson<StatusResponse>(res);
  } catch {
    return { ok: false, error: "Sem conexão com o servidor." };
  }
}

export function isApiFail(value: unknown): value is ApiFail {
  return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false;
}
