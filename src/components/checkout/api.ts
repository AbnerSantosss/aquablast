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
  /** Só nas respostas de POST /pay com `status:"refused"|"error"`: texto do gateway para o cliente. */
  message?: string | null;
  status?: string;
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
  /** Cor da 2ª unidade (só com bump). Pode faltar enquanto o cliente escolhe; o pagamento exige. */
  bumpColor?: string;
  /** `cpf` fica de fora no carrinho retomado (plano 8.8) enquanto a pessoa não digitar um novo: o servidor mantém o gravado. */
  customer?: { name: string; email: string; phone: string; cpf?: string };
  address?: { cep: string; street: string; number: string; extra?: string; district: string; city: string; state: string; recipient: string };
  tracking?: CartTrackingInput;
  /** Cupom de teste (`?cupom=`); só vai quando existe. */
  coupon?: string;
  /** Id da visita (o mesmo de postOpened): o InitiateCheckout do carrinho usa o mesmo event_id da abertura. */
  visit?: string;
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

/**
 * Avisa o servidor que o checkout foi aberto (aviso "checkout aberto" da equipe e InitiateCheckout pelo servidor). Fogo e esquece: não
 * trava a tela nem mostra erro.
 */
export function postOpened(payload: { visit: string; selection: CartSelectionInput; coupon?: string; source?: string; campaign?: string; consent?: boolean }): void {
  try {
    void fetch("/api/checkout/opened", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
      // Lê o corpo: sem isso o Chromium não fecha a requisição e o "networkidle" dos testes nunca chega.
      .then((res) => res.text())
      .catch(() => undefined);
  } catch {
    // navegador sem fetch: o aviso é opcional.
  }
}

export interface PayPayload {
  cartToken: string;
  method: "pix" | "card";
  installments: number;
  bump: boolean;
  /** Obrigatória com bump: sem ela o servidor responde 400. */
  bumpColor?: string;
  card?: CardFormData;
  cardToken?: string;
  cardBrand?: string;
  cardPaymentMethodId?: string;
  cardIssuerId?: string;
  cardLast4?: string;
  coupon?: string;
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

/** Só com o gateway `simulado` (plano 8.6: botão "Simular pagamento aprovado"). Em produção a rota responde 404. */
export async function postSimulatePaid(publicToken: string): Promise<{ ok: true; status: string; orderNumber: string } | ApiFail> {
  try {
    const res = await fetch("/api/checkout/simular-pagamento", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicToken }),
    });
    return await parseJson<{ ok: true; status: string; orderNumber: string }>(res);
  } catch {
    return { ok: false, error: "Sem conexão com o servidor." };
  }
}

export function isApiFail(value: unknown): value is ApiFail {
  return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false;
}
