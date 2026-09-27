import { getSetting } from "@/lib/settings";
import type { CheckoutPack } from "./catalog";

/**
 * Preço do checkout próprio (Fase 4.2). O preço é SEMPRE calculado aqui, no servidor.
 * O navegador manda `pack`, `colors`, `bump`, `method`, `installments`; nunca um valor.
 */
export type PayMethod = "pix" | "card";

export interface Quote {
  /** Pack efetivo (unidade com bump vira kit). */
  pack: CheckoutPack;
  method: PayMethod;
  amountCents: number;
  /** Quanto custa a mais aceitar a 2ª unidade (kit − unidade, no mesmo método). */
  bumpDeltaCents: number;
  /** Quanto se economiza no kit contra 2 unidades (2 × unidade − kit). */
  bumpSavingCents: number;
  installments: number;
  /** Valor de cada parcela (sem juros). No Pix é igual ao total. */
  installmentCents: number;
}

/** `bump = true` numa compra de unidade vira kit. `installments` só conta no cartão e é limitado por `checkout.maxInstallments`. */
export async function quote(pack: CheckoutPack, method: PayMethod, bump: boolean, installments = 1): Promise<Quote> {
  const prices = await getSetting("checkout.prices");
  const max = await getSetting("checkout.maxInstallments");
  const finalPack: CheckoutPack = pack === "unit" && bump ? "kit" : pack;
  const amountCents = prices[finalPack][method];
  const n = method === "card" ? Math.min(Math.max(1, Math.trunc(installments)), Math.max(1, max)) : 1;
  return {
    pack: finalPack,
    method,
    amountCents,
    bumpDeltaCents: prices.kit[method] - prices.unit[method],
    bumpSavingCents: prices.unit[method] * 2 - prices.kit[method],
    installments: n,
    installmentCents: Math.round(amountCents / n), // parcelado sem juros
  };
}

/** Cotação dos dois métodos de uma vez (resposta de POST /api/checkout/cart). */
export async function quoteBoth(pack: CheckoutPack, bump: boolean, installments = 1): Promise<{ pix: Quote; card: Quote }> {
  return { pix: await quote(pack, "pix", bump, 1), card: await quote(pack, "card", bump, installments) };
}
