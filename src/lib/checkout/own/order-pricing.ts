import type { OrderItem } from "@/db/schema";
import { orderItemOf, type Selection } from "./catalog";
import type { ItemsQuote } from "./items-cart";
import type { Quote } from "./pricing";

/** Um item físico por pedido, com frete separado e snapshot durável da composição do total. */
export function orderItemFromQuote(selection: Selection, q: Quote): OrderItem {
  // O cupom de teste reduz o total, até abaixo do frete. Aplica primeiro aos produtos e depois ao frete,
  // sem criar preço negativo; o snapshot preserva os valores anteriores ao desconto.
  const productsPaidCents = Math.max(0, q.productSubtotalCents - q.couponDiscountCents);
  return {
    ...orderItemOf(selection, productsPaidCents),
    checkoutPricing: {
      productSubtotalCents: q.productSubtotalCents,
      shippingCents: q.shippingCents,
      shippingMethod: q.shippingMethod,
      couponDiscountCents: q.couponDiscountCents,
    },
  };
}

/**
 * Itens do pedido de um carrinho de vários produtos (multiempresa): um OrderItem por produto, com o preço
 * unitário do método (em reais, como o legado). O snapshot `checkoutPricing` vai só no primeiro item.
 */
export function orderItemsFromItemsQuote(q: ItemsQuote): OrderItem[] {
  return q.lines.map((l, i) => ({
    name: l.name,
    sku: l.sku,
    variant: null,
    quantity: l.quantity,
    unitPrice: l.unitCents / 100,
    ...(i === 0
      ? { checkoutPricing: { productSubtotalCents: q.productSubtotalCents, shippingCents: q.shippingCents, shippingMethod: q.shippingMethod, couponDiscountCents: q.couponDiscountCents } }
      : {}),
  }));
}

/**
 * Só lê o snapshot salvo. Histórico sem snapshot ou com total incompatível permanece desconhecido.
 * Pedido legado: 1 item com o snapshot. Pedido de itens (multiempresa): vários itens, snapshot só no 1º.
 */
export function checkoutPricingOfOrder(items: readonly OrderItem[], amountCents: number): OrderItem["checkoutPricing"] | null {
  if (items.length < 1) return null;
  const withPricing = items.filter((i) => i.checkoutPricing);
  if (withPricing.length !== 1 || !items[0].checkoutPricing) return null;
  const p = items[0].checkoutPricing;
  if (![p.productSubtotalCents, p.shippingCents, p.couponDiscountCents, amountCents].every((n) => Number.isInteger(n) && n >= 0)) return null;
  if (p.productSubtotalCents + p.shippingCents - p.couponDiscountCents !== amountCents) return null;
  return p;
}
