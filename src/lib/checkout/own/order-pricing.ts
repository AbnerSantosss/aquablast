import type { OrderItem } from "@/db/schema";
import { orderItemOf, type Selection } from "./catalog";
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
      couponDiscountCents: q.couponDiscountCents,
    },
  };
}

/** Só lê o snapshot salvo. Histórico sem snapshot ou com total incompatível permanece desconhecido. */
export function checkoutPricingOfOrder(items: readonly OrderItem[], amountCents: number): OrderItem["checkoutPricing"] | null {
  if (items.length !== 1) return null;
  const p = items[0].checkoutPricing;
  if (!p) return null;
  if (![p.productSubtotalCents, p.shippingCents, p.couponDiscountCents, amountCents].every((n) => Number.isInteger(n) && n >= 0)) return null;
  if (p.productSubtotalCents + p.shippingCents - p.couponDiscountCents !== amountCents) return null;
  return p;
}
