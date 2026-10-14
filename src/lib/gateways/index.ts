import { getOwnCompanySetting } from "@/lib/settings";
import { companyOf } from "./items";
import { fastpayGateway } from "./fastpay";
import { ironpayGateway } from "./ironpay";
import { mercadopagoGateway } from "./mercadopago";
import { simuladoGateway } from "./simulado";
import type { Gateway, GatewayMethod, GatewayName } from "./types";

export type { ChargeInput, ChargeItem, ChargeResult, Gateway, GatewayContext, GatewayMethod, GatewayName, GatewayStatus, StatusResult } from "./types";
export { companyOf, DEFAULT_GATEWAY_COMPANY, itemsForGateway, legacyChargeItems } from "./items";
export { toPaymentStatus } from "./types";

const GATEWAYS: Record<GatewayName, Gateway> = {
  ironpay: ironpayGateway,
  mercadopago: mercadopagoGateway,
  fastpay: fastpayGateway,
  simulado: simuladoGateway,
};

export const GATEWAY_LABELS: Record<GatewayName, string> = {
  ironpay: "IronPay",
  mercadopago: "Mercado Pago",
  fastpay: "FastPay",
  simulado: "Simulado (teste)",
};

export const isGatewayName = (v: unknown): v is GatewayName => typeof v === "string" && v in GATEWAYS;

export function getGateway(name: GatewayName): Gateway {
  return GATEWAYS[name];
}

/**
 * Gateway escolhido no painel para o método (`gateway.pix` / `gateway.card`).
 * Devolve null quando o cartão está "desligado", quando o gateway não suporta o método ou quando falta credencial.
 * `companyId` (multiempresa): escolha e credenciais da empresa (getCompanySetting); ausente = AquaBlast, como antes.
 */
export async function gatewayFor(method: GatewayMethod, companyId?: string | null): Promise<Gateway | null> {
  const company = companyOf(companyId ? { companyId } : null);
  // Roteamento nunca herda do global: empresa nova sem gateway escolhido não cobra (nem cai no simulado).
  const name = await getOwnCompanySetting(company, method === "pix" ? "gateway.pix" : "gateway.card");
  if (name === undefined || name === "desligado" || !isGatewayName(name)) return null;
  const gw = GATEWAYS[name];
  if (!gw.supports[method]) return null;
  return (await gw.configured({ companyId: company })) ? gw : null;
}
