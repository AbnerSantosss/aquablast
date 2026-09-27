import type { Color, Pack } from "@/lib/site/types";
import { COLOR_KEYS, COLOR_LABELS } from "@/lib/site/constants";

/**
 * Catálogo fixo do checkout próprio (Fase 4.1 do plano).
 * Os SKUs são os mesmos já cadastrados na Zedy (wiki/operacao/aquablast-checkout-zedy.md). Não mude o formato.
 * Este arquivo é puro (sem banco): pode ser importado no cliente e no servidor.
 */
export type CheckoutPack = Pack; // "unit" | "kit"

export const isColor = (v: unknown): v is Color => typeof v === "string" && (COLOR_KEYS as string[]).includes(v);

/** 1 cor na unidade, 2 no kit (a mesma cor duas vezes é permitida). */
export interface Selection {
  pack: CheckoutPack;
  colors: Color[];
}

/** Lê a seleção da URL. Qualquer valor inválido cai no padrão (unidade azul / kit azul+preto). */
export function selectionFromParams(p: Record<string, string | string[] | undefined>): Selection {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const pack: CheckoutPack = one(p.pack) === "kit" || one(p.product) === "kit" ? "kit" : "unit";
  if (pack === "kit") {
    const c1 = one(p.cor1);
    const c2 = one(p.cor2);
    return { pack, colors: [isColor(c1) ? c1 : "azul", isColor(c2) ? c2 : "preto"] };
  }
  const c = one(p.cor);
  return { pack, colors: [isColor(c) ? c : "azul"] };
}

/** Reconstrói a seleção a partir do que está gravado no carrinho (pack/colors em texto). Inválido → padrão. */
export function selectionFromCart(cart: { pack: string; colors: string[] }): Selection {
  return selectionFromParams({ pack: cart.pack, cor: cart.colors[0], cor1: cart.colors[0], cor2: cart.colors[1] });
}

export function skuOf(s: Selection): string {
  const up = (c: Color) => c.toUpperCase();
  return s.pack === "kit" ? `AQB-KIT-${up(s.colors[0])}-${up(s.colors[1])}` : `AQB-1UN-${up(s.colors[0])}`;
}

export function titleOf(s: Selection): string {
  return s.pack === "kit" ? "Kit com 2 AquaBlast" : "1 unidade AquaBlast";
}

export function variantOf(s: Selection): string {
  return s.colors.map((c) => COLOR_LABELS[c]).join(" + ");
}

/** Item único do pedido/carrinho, no formato de `orders.items`. `unitPrice` em reais. */
export function orderItemOf(s: Selection, amountCents: number): { name: string; sku: string; variant: string; quantity: number; unitPrice: number } {
  return { name: titleOf(s), sku: skuOf(s), variant: variantOf(s), quantity: 1, unitPrice: amountCents / 100 };
}
