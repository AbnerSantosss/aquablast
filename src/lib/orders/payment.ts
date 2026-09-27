import { type Order, type PaymentStatus } from "@/db/schema";
import { sendOrderEmail } from "@/lib/email/send";
import { getOrderById, issueAccessCode, transitionOrder, updateOrderFields } from "@/lib/orders/service";
import { statusFromPayment } from "@/lib/orders/status";

export interface ApplyPaymentArgs {
  orderId: string;
  paymentStatus: PaymentStatus;
  source: "checkout" | "system" | "admin";
  /** Prefixo da chave de deduplicação dos eventos (ex.: `wh:<deliveryId>` ou `own:<attemptId>`). */
  dedupeKey: string;
}

export interface ApplyPaymentResult {
  order: Order;
  /** Frases curtas em pt-BR do que aconteceu, para o log/webhook_deliveries. */
  detail: string[];
  /** true só na PRIMEIRA vez que o pedido virou "approved" nesta chamada: quem chamou deve disparar Purchase + markCartConverted. */
  becamePaid: boolean;
}

/**
 * Aplica um novo status de pagamento a um pedido e avança o status logístico correspondente.
 * Extraído de ingest.ts (webhook Zedy) para ser compartilhado com o checkout próprio: mesma regra,
 * mesmos textos. Regras:
 * - nunca rebaixa um pedido pago para pendente;
 * - pago pela primeira vez → status approved + código de acesso + e-mail de confirmação (`becamePaid: true`);
 * - recusado/estornado/cancelado → status conforme statusFromPayment (cancelled).
 * Não dispara rastreamento de anúncios nem mexe no carrinho: isso é responsabilidade de quem chama.
 */
export async function applyPaymentStatus(args: ApplyPaymentArgs): Promise<ApplyPaymentResult> {
  let order = await getOrderById(args.orderId);
  if (!order) throw new Error("Pedido não encontrado");
  const detail: string[] = [];
  let becamePaid = false;
  const wasPaid = order.paymentStatus === "paid";

  if (args.paymentStatus !== order.paymentStatus) {
    if (wasPaid && args.paymentStatus === "pending") {
      detail.push("ignorado: tentativa de voltar pago → pendente");
    } else {
      await updateOrderFields(order.id, { paymentStatus: args.paymentStatus, paidAt: args.paymentStatus === "paid" ? new Date() : order.paidAt });
      detail.push(`pagamento: ${order.paymentStatus} → ${args.paymentStatus}`);
      order = (await getOrderById(order.id))!;
    }
  }

  const target = statusFromPayment(order.paymentStatus);
  if (target && order.status !== target) {
    const res = await transitionOrder({ orderId: order.id, to: target, source: args.source, dedupeKey: `${args.dedupeKey}:${target}` });
    if (res.ok && res.changed) {
      order = res.order;
      detail.push(`status → ${target}`);
      if (target === "approved") {
        becamePaid = true;
        const { code } = await issueAccessCode(order.id, args.source);
        const mail = await sendOrderEmail(order, "order_confirmed", { accessCode: code, automatic: true });
        detail.push(mail.ok ? "e-mail de confirmação enviado" : `e-mail: ${mail.error ?? mail.skipped}`);
      }
    } else if (!res.ok) detail.push(`status: ${res.reason}`);
  }

  return { order, detail, becamePaid };
}
