import type { OrderStatus, PaymentStatus } from "@/db/schema";
import { PAYMENT_LABEL, STATUS_LABEL } from "@/lib/orders/status";

const STATUS_TONE: Record<OrderStatus, string> = {
  created: "gray",
  approved: "blue",
  preparing: "blue",
  shipped: "cyan",
  in_transit: "cyan",
  out_for_delivery: "orange",
  delivered: "green",
  exception: "red",
  cancelled: "red",
};

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  pending: "orange",
  paid: "green",
  refused: "red",
  refunded: "red",
  chargeback: "red",
  cancelled: "gray",
  expired: "gray",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge tone-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={`badge tone-${PAYMENT_TONE[status]}`}>{PAYMENT_LABEL[status]}</span>;
}

const WEBHOOK_TONE: Record<string, string> = {
  received: "gray",
  processed: "green",
  ignored: "gray",
  unmapped: "orange",
  error: "red",
  unauthorized: "red",
};
const WEBHOOK_LABEL: Record<string, string> = {
  received: "Recebido",
  processed: "Processado",
  ignored: "Ignorado",
  unmapped: "Sem pedido",
  error: "Erro",
  unauthorized: "Não autorizado",
};

export function WebhookBadge({ status }: { status: string }) {
  return <span className={`badge tone-${WEBHOOK_TONE[status] ?? "gray"}`}>{WEBHOOK_LABEL[status] ?? status}</span>;
}

export function SourceBadge({ source }: { source: string }) {
  const label: Record<string, string> = { checkout: "Checkout", tracking: "Transportadora", admin: "Painel", system: "Sistema" };
  return <span className={`badge badge-outline src-${source}`}>{label[source] ?? source}</span>;
}

export function EmailStatusBadge({ status }: { status: string }) {
  return <span className={`badge tone-${status === "sent" ? "green" : "red"}`}>{status === "sent" ? "Enviado" : "Erro"}</span>;
}

export function Tone({ tone, children }: { tone: "gray" | "blue" | "cyan" | "orange" | "green" | "red"; children: React.ReactNode }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}
