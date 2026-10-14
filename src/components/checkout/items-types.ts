/**
 * Tipos do checkout por itens (`/c/[slug]`, multiempresa 2026-10-13). Sem import de servidor: usados pela
 * página (servidor) e pelo `<Checkout itemsMode>` / `<ItemsSummary>` (cliente).
 */

/** Produto como a tela vê: preços em centavos dos dois métodos (só exibição; o servidor recalcula ao pagar). */
export interface ItemsCatalogProduct {
  slug: string;
  name: string;
  description: string | null;
  /** Foto do produto (image_url) ou, nos produtos unit-* do AquaBlast, a foto da cor. null: ícone. */
  imageUrl: string | null;
  pricePixCents: number;
  priceCardCents: number;
}

export interface ItemsLine {
  productSlug: string;
  quantity: number;
}

export interface ItemsModeProps {
  companySlug: string;
  companyName: string;
  products: ItemsCatalogProduct[];
  initialItems: ItemsLine[];
}

export const ITEMS_MAX_QUANTITY = 20;
export const ITEMS_MAX_LINES = 20;

/**
 * Prévia local dos totais enquanto a gravação do carrinho não volta (troca de quantidade). Mesma conta do servidor
 * (`quoteItems`: soma dos preços do catálogo × quantidade + frete); só exibição, o servidor recalcula ao gravar e ao pagar.
 */
export function previewItemsQuotes<Q extends { productSubtotalCents: number; shippingCents: number; amountCents: number; installments: number; installmentCents: number }>(
  products: readonly ItemsCatalogProduct[],
  items: readonly ItemsLine[],
  current: { pix: Q; card: Q },
): { pix: Q; card: Q } {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const sum = (card: boolean) => items.reduce((s, i) => {
    const p = bySlug.get(i.productSlug);
    return p ? s + (card ? p.priceCardCents : p.pricePixCents) * i.quantity : s;
  }, 0);
  const pixSub = sum(false);
  const cardSub = sum(true);
  const pixAmount = pixSub + current.pix.shippingCents;
  const cardAmount = cardSub + current.card.shippingCents;
  const n = Math.max(1, current.card.installments);
  return {
    pix: { ...current.pix, productSubtotalCents: pixSub, amountCents: pixAmount, installmentCents: pixAmount },
    card: { ...current.card, productSubtotalCents: cardSub, amountCents: cardAmount, installmentCents: Math.round(cardAmount / n) },
  };
}
