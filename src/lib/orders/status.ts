import type { OrderStatus, PaymentStatus } from "@/db/schema";

/** Ordem lógica das etapas visíveis ao comprador (mesma da página /rastrear). */
export const STATUS_ORDER: OrderStatus[] = [
  "created",
  "approved",
  "preparing",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

export const TERMINAL: ReadonlySet<OrderStatus> = new Set(["delivered", "cancelled"]);

export const STATUS_LABEL: Record<OrderStatus, string> = {
  created: "Pedido recebido",
  approved: "Pagamento aprovado",
  preparing: "Em preparação",
  shipped: "Enviado",
  in_transit: "Em trânsito",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  exception: "Ocorrência",
  cancelled: "Cancelado",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  refused: "Recusado",
  refunded: "Estornado",
  chargeback: "Chargeback",
  cancelled: "Cancelado",
  expired: "Expirado",
};

export function rank(status: OrderStatus): number {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? -1 : i;
}

/**
 * Regra de progressão: o status só anda para frente na linha principal.
 * `exception` e `cancelled` podem ser aplicados a qualquer momento (exceto sobre `delivered`).
 * Um pedido `cancelled` só sai desse estado por ação explícita do admin (`force`).
 * Voltar de `exception` para a linha principal é permitido (ex.: transportadora resolveu).
 */
export function canTransition(from: OrderStatus, to: OrderStatus, opts: { force?: boolean } = {}): boolean {
  if (from === to) return false;
  if (opts.force) return true;
  if (from === "cancelled") return false;
  if (from === "delivered") return false;
  if (to === "cancelled" || to === "exception") return true;
  if (from === "exception") return rank(to) >= 0;
  return rank(to) > rank(from);
}

/** Campo de timestamp que cada status preenche (quando ainda vazio). */
export const STATUS_TIMESTAMP_FIELD: Partial<Record<OrderStatus, "approvedAt" | "preparingAt" | "shippedAt" | "inTransitAt" | "outForDeliveryAt" | "deliveredAt" | "cancelledAt">> = {
  approved: "approvedAt",
  preparing: "preparingAt",
  shipped: "shippedAt",
  in_transit: "inTransitAt",
  out_for_delivery: "outForDeliveryAt",
  delivered: "deliveredAt",
  cancelled: "cancelledAt",
};

/** Texto padrão do evento gerado quando o status muda. */
export const STATUS_EVENT_TEXT: Record<OrderStatus, { title: string; description: string }> = {
  created: { title: "Pedido recebido", description: "Recebemos seu pedido e estamos aguardando a confirmação do pagamento." },
  approved: { title: "Pagamento aprovado", description: "Seu pagamento foi confirmado. Já estamos separando seu AquaBlast." },
  preparing: { title: "Em preparação", description: "Seu pedido está sendo embalado com carinho." },
  shipped: { title: "Pedido enviado", description: "Seu pedido foi entregue à transportadora." },
  in_transit: { title: "Em trânsito", description: "Seu pedido está a caminho." },
  out_for_delivery: { title: "Saiu para entrega", description: "O entregador está com o seu pedido. Fique de olho na campainha!" },
  delivered: { title: "Entregue", description: "Seu pedido foi entregue. Boa diversão!" },
  exception: { title: "Ocorrência na entrega", description: "Houve uma ocorrência com o seu pedido. Nossa equipe já está acompanhando." },
  cancelled: { title: "Pedido cancelado", description: "Este pedido foi cancelado." },
};

/** Status inferido a partir do pagamento reportado pelo checkout. */
export function statusFromPayment(payment: PaymentStatus): OrderStatus | null {
  switch (payment) {
    case "paid":
      return "approved";
    case "refused":
    case "refunded":
    case "chargeback":
    case "cancelled":
    case "expired":
      return "cancelled";
    default:
      return null;
  }
}
