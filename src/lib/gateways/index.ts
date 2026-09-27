import { getSetting } from "@/lib/settings";
import { fastpayGateway } from "./fastpay";
import { ironpayGateway } from "./ironpay";
import { mercadopagoGateway } from "./mercadopago";
import { simuladoGateway } from "./simulado";
import type { Gateway, GatewayMethod, GatewayName } from "./types";

export type { ChargeInput, ChargeResult, Gateway, GatewayMethod, GatewayName, GatewayStatus, StatusResult } from "./types";
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
 */
export async function gatewayFor(method: GatewayMethod): Promise<Gateway | null> {
  const name = method === "pix" ? await getSetting("gateway.pix") : await getSetting("gateway.card");
  if (name === "desligado" || !isGatewayName(name)) return null;
  const gw = GATEWAYS[name];
  if (!gw.supports[method]) return null;
  return (await gw.configured()) ? gw : null;
}
