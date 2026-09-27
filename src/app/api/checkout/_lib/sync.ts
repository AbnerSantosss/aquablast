import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { paymentAttempts, type Order, type PaymentAttempt } from "@/db/schema";
import { getCartById, markCartConverted } from "@/lib/checkout/own/cart";
import { env } from "@/lib/env";
import type { GatewayName, GatewayStatus, StatusResult } from "@/lib/gateways";
import { errorMessage, log } from "@/lib/log";
import { applyPaymentStatus } from "@/lib/orders/payment";
import { addOrderEvent, getOrderById } from "@/lib/orders/service";
import { getSetting } from "@/lib/settings";
import { trackServerEvent } from "@/lib/tracking-ads/dispatch";

/**
 * Regras compartilhadas de "o gateway disse X sobre a tentativa Y" (plano 7.2 passo 11, 7.3, 7.4 e 7.6).
 * Quem chama SEMPRE passa um status vindo de `gw.fetchStatus` (ou do retorno síncrono de `charge`):
 * o status que chega no corpo de um postback nunca é usado.
 */

/** URL do postback que vai no `charge()`: `<APP_URL>/api/webhooks/gateway/<gateway>/<gateway.postbackToken>`. */
export async function postbackUrlFor(gateway: GatewayName): Promise<string | null> {
  const token = await getSetting("gateway.postbackToken");
  const base = env().APP_URL.replace(/\/+$/, "");
  if (!token) {
    // O simulado não recebe postback; os gateways reais precisam do token gerado no painel.
    return gateway === "simulado" ? `${base}/api/webhooks/gateway/simulado/sem-token` : null;
  }
  return `${base}/api/webhooks/gateway/${gateway}/${encodeURIComponent(token)}`;
}

/** Pedido pago pela primeira vez: carrinho convertido + Purchase (id `pur-<orderNumber>`), depois da resposta. */
export async function onOrderPaid(order: Order): Promise<void> {
  if (order.cartId) await markCartConverted(order.cartId, order.id);
  const cartId = order.cartId;
  after(async () => {
    try {
      const cart = cartId ? await getCartById(cartId) : null;
      await trackServerEvent({ name: "Purchase", eventId: `pur-${order.orderNumber}`, order, cart: cart ?? undefined });
    } catch (err) {
      log.error("checkout: falha ao disparar Purchase", { orderId: order.id, error: errorMessage(err) });
    }
  });
}

export interface SyncOutcome {
  order: Order | null;
  /** Status final da tentativa depois da sincronização. */
  attemptStatus: string;
  detail: string[];
}

/**
 * Aplica o status consultado no gateway a uma tentativa e ao pedido dela.
 * - `error`: não muda nada (consulta falhou; o pedido continua como está).
 * - `paid`: pedido pago; na primeira vez → `markCartConverted` + Purchase.
 * - `refused`: só a tentativa. **Não cancela o pedido** (o comprador pode tentar de novo).
 * - `refunded`: estorna o pedido só se ele (ou a tentativa) estava pago.
 * - `canceled`: cancela o pedido só se ele não está pago e não há outra tentativa `pending`/`paid`.
 * `dedupeKey` padrão: `pb:<attemptId>` (os eventos do pedido ficam `pb:<attemptId>:<status>`).
 */
export async function syncAttempt(attempt: PaymentAttempt, st: StatusResult, source: "checkout" | "system", dedupeKey = `pb:${attempt.id}`): Promise<SyncOutcome> {
  const detail: string[] = [];
  const next: GatewayStatus = st.status;
  if (next === "error") {
    detail.push(`consulta ao gateway falhou${st.reason ? `: ${st.reason.slice(0, 200)}` : ""}`);
    return { order: await getOrderById(attempt.orderId), attemptStatus: attempt.status, detail };
  }

  const wasPaid = attempt.status === "paid";
  if (attempt.status !== next) {
    await db
      .update(paymentAttempts)
      .set({ status: next, statusReason: st.reason ? st.reason.slice(0, 300) : attempt.statusReason, updatedAt: new Date() })
      .where(eq(paymentAttempts.id, attempt.id));
    detail.push(`tentativa: ${attempt.status} → ${next}`);
  }

  let order = await getOrderById(attempt.orderId);
  if (!order) {
    detail.push("pedido da tentativa não encontrado");
    return { order: null, attemptStatus: next, detail };
  }

  if (next === "paid") {
    const res = await applyPaymentStatus({ orderId: order.id, paymentStatus: "paid", source, dedupeKey });
    order = res.order;
    detail.push(...res.detail);
    if (res.becamePaid) await onOrderPaid(order);
  } else if (next === "refunded") {
    if (wasPaid || order.paymentStatus === "paid") {
      const res = await applyPaymentStatus({ orderId: order.id, paymentStatus: "refunded", source, dedupeKey });
      order = res.order;
      detail.push(...res.detail);
    } else detail.push("estorno ignorado: pedido não estava pago");
  } else if (next === "canceled") {
    if (order.paymentStatus === "pending" && !(await hasOtherLiveAttempt(order.id, attempt.id))) {
      const res = await applyPaymentStatus({ orderId: order.id, paymentStatus: "cancelled", source, dedupeKey });
      order = res.order;
      detail.push(...res.detail);
    } else detail.push("cancelamento ignorado: pedido pago ou com outra tentativa em aberto");
  } else if (next === "refused" && attempt.status !== "refused") {
    await addOrderEvent({ orderId: order.id, title: "Pagamento recusado", description: "O pagamento não foi autorizado. O pedido continua aguardando pagamento.", source, dedupeKey: `${dedupeKey}:refused` });
    detail.push("pagamento recusado (pedido continua pendente)");
  }

  return { order, attemptStatus: next, detail };
}

async function hasOtherLiveAttempt(orderId: string, attemptId: string): Promise<boolean> {
  const row = await db.query.paymentAttempts.findFirst({
    where: and(eq(paymentAttempts.orderId, orderId), ne(paymentAttempts.id, attemptId), inArray(paymentAttempts.status, ["pending", "paid"])),
    columns: { id: true },
  });
  return !!row;
}

/** Tentativa mais recente de um pedido (para a tela de status). */
export async function latestAttempt(orderId: string): Promise<PaymentAttempt | null> {
  return (await db.query.paymentAttempts.findFirst({ where: eq(paymentAttempts.orderId, orderId), orderBy: desc(paymentAttempts.createdAt) })) ?? null;
}

/** Status público do pedido do checkout (plano 7.3): só estes quatro valores. */
export function publicPaymentState(order: Order, last: PaymentAttempt | null): "pending" | "paid" | "refused" | "canceled" {
  if (order.paymentStatus === "paid") return "paid";
  if (order.paymentStatus !== "pending" || order.status === "cancelled") return "canceled";
  if (last?.status === "refused") return "refused";
  return "pending";
}
