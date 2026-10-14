/** Regra da oferta: o frete é grátis em todo pedido; o Frete FULL é uma opção paga, escolhida na etapa de entrega. */
export const FULL_SHIPPING_CENTS = 999;
export const FULL_SHIPPING_LABEL = "Frete FULL";
export const FREE_SHIPPING_LABEL = "Frete grátis";

export const SHIPPING_METHODS = ["free", "full"] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];
export const DEFAULT_SHIPPING_METHOD: ShippingMethod = "free";

/** Valor gravado fora do esperado (carrinho antigo, coluna nula) vale como frete grátis: nunca cobra por engano. */
export function shippingMethodOf(raw: unknown): ShippingMethod {
  return raw === "full" ? "full" : DEFAULT_SHIPPING_METHOD;
}

export function shippingCentsFor(method: ShippingMethod): number {
  return method === "full" ? FULL_SHIPPING_CENTS : 0;
}

export function shippingLabelOf(method: ShippingMethod): string {
  return method === "full" ? FULL_SHIPPING_LABEL : FREE_SHIPPING_LABEL;
}
