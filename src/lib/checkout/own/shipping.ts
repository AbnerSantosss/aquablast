import type { CheckoutPack } from "./catalog";

/** Regra da oferta: uma unidade paga FULL; duas unidades recebem o mesmo frete sem custo. */
export const FULL_SHIPPING_CENTS = 999;
export const FULL_SHIPPING_LABEL = "Frete FULL";

/** Recebe o pack efetivo: unidade com o adicional aceito já é "kit". */
export function shippingCentsForPack(pack: CheckoutPack): number {
  return pack === "kit" ? 0 : FULL_SHIPPING_CENTS;
}
