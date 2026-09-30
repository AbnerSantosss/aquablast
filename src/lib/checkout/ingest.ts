import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { orders, webhookDeliveries, type Order } from "@/db/schema";
import { notifyCheckoutEvent } from "@/lib/email/checkout-alerts";
import { sendOrderEmail } from "@/lib/email/send";
import { applyPaymentStatus } from "@/lib/orders/payment";
import { addOrderEvent, encryptDocument, generateOrderNumber, getOrderById, updateOrderFields } from "@/lib/orders/service";
import { getSettings } from "@/lib/settings";
import { trackServerEvent, zedyPurchaseEnabled } from "@/lib/tracking-ads/dispatch";
import { normalizeCheckoutPayload, type NormalizedCheckout } from "./normalize";
import { OWN_PROVIDER } from "./own/order";

export type IngestOutcome = { status: "processed" | "ignored" | "unmapped"; detail: string; orderId: string | null };

/**
 * Cria ou atualiza o pedido a partir de um webhook do checkout já gravado em webhook_deliveries.
 * Regras:
 * - identifica pelo (provider, externalId); sem externalId → `unmapped`.
 * - pagamento aprovado pela primeira vez → status approved + código de acesso + e-mail de confirmação.
 * - Pix pendente novo → e-mail com o Pix (se template ligado).
 * - pagamento recusado/estornado/cancelado → status cancelled.
 * - nunca rebaixa um pedido pago para pendente.
 */
export async function ingestCheckoutWebhook(deliveryId: string, payload: unknown): Promise<IngestOutcome> {
  const s = await getSettings(["checkout.provider", "checkout.fieldMap"] as const);
  const n = normalizeCheckoutPayload(payload, s["checkout.fieldMap"] ?? {});
  const provider = s["checkout.provider"] || "generic";

  const finish = async (outcome: IngestOutcome) => {
    await db.update(webhookDeliveries).set({ status: outcome.status, detail: outcome.detail, orderId: outcome.orderId, processedAt: new Date() }).where(eq(webhookDeliveries.id, deliveryId));
    return outcome;
  };

  if (!n.externalId) {
    return finish({ status: "unmapped", detail: `Sem identificador do pedido no payload (faltando: ${n.missing.join(", ")}). Configure o mapa de campos ou trate manualmente.`, orderId: null });
  }

  let order = (await db.query.orders.findFirst({ where: and(eq(orders.checkoutProvider, provider), eq(orders.externalId, n.externalId)) })) ?? null;
  const isNew = !order;

  const fields = fieldsFromNormalized(n);
  if (!order) {
    const orderNumber = n.orderNumber ?? generateOrderNumber();
    const [created] = await db
      .insert(orders)
      .values({ ...fields, orderNumber, externalId: n.externalId, checkoutProvider: provider, status: "created", paymentStatus: n.paymentStatus ?? "pending" })
      .onConflictDoNothing({ target: orders.orderNumber })
      .returning();
    if (!created) {
      // colisão de order_number com outro externalId: usa número gerado
      const [again] = await db
        .insert(orders)
        .values({ ...fields, orderNumber: generateOrderNumber(), externalId: n.externalId, checkoutProvider: provider, status: "created", paymentStatus: n.paymentStatus ?? "pending" })
        .returning();
      order = again;
    } else order = created;
    await addOrderEvent({ orderId: order.id, title: "Pedido recebido", description: "Pedido criado a partir do checkout.", source: "checkout", status: "created", dedupeKey: `wh:${deliveryId}:created` });
  } else {
    // Atualiza dados cadastrais/pix sem sobrescrever com vazio.
    const patch: Partial<typeof orders.$inferInsert> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v === null || v === undefined || v === "") continue;
      if (Array.isArray(v) && v.length === 0) continue; // ex.: webhook de pagamento sem itens não apaga os itens
      (patch as Record<string, unknown>)[k] = v;
    }
    delete (patch as Record<string, unknown>).paymentStatus;
    if (Object.keys(patch).length) await updateOrderFields(order.id, patch);
    order = (await getOrderById(order.id))!;
  }

  const detail: string[] = [isNew ? "pedido criado" : "pedido atualizado"];

  // Mesma regra de antes (nunca rebaixa pago → pendente; aprovado pela 1ª vez → código + e-mail),
  // agora em applyPaymentStatus, compartilhada com o checkout próprio. Sem status novo no payload,
  // ainda avança o status logístico a partir do pagamento atual, como sempre fez.
  const applied = await applyPaymentStatus({ orderId: order.id, paymentStatus: n.paymentStatus ?? order.paymentStatus, source: "checkout", dedupeKey: `wh:${deliveryId}` });
  order = applied.order;
  detail.push(...applied.detail);

  // Purchase pela CAPI/GA4 para pedidos que ainda vêm da Zedy (plano 9.6). DESLIGADO por padrão
  // (ZEDY_PURCHASE_ENABLED em tracking-ads/dispatch.ts): enquanto a Zedy também manda Purchase pelo Pixel dela,
  // ligar isto conta a venda em dobro. Mesmo event_id do checkout próprio (pur-<orderNumber>), então nunca duplica aqui.
  if (applied.becamePaid && order.checkoutProvider !== OWN_PROVIDER && (await zedyPurchaseEnabled())) {
    await trackServerEvent({ name: "Purchase", eventId: `pur-${order.orderNumber}`, order });
    detail.push("Purchase repassado ao rastreamento de anúncios (ver conversion_events)");
  }

  // Aviso "pago" da Zedy (e-mail + push do app do painel), como o onOrderPaid faz no checkout próprio.
  // Uma vez por pedido (email_log / push_alerts); depois da resposta, para não atrasar o webhook.
  if (applied.becamePaid && order.checkoutProvider !== OWN_PROVIDER) {
    const paidOrder = order;
    after(() => notifyCheckoutEvent({ event: "pago", order: paidOrder }));
  }

  if (isNew && order.paymentStatus === "pending" && order.pixCode) {
    const mail = await sendOrderEmail(order, "pix_pending", { automatic: true });
    detail.push(mail.ok ? "e-mail do Pix enviado" : `e-mail Pix: ${mail.error ?? mail.skipped}`);
  }

  if (n.trackingCode && !order.trackingCode) {
    await updateOrderFields(order.id, { trackingCode: n.trackingCode, carrierName: n.carrierName ?? order.carrierName });
    detail.push("código de rastreio recebido do checkout");
  }

  return finish({ status: "processed", detail: detail.join("; "), orderId: order.id });
}

function fieldsFromNormalized(n: NormalizedCheckout): Partial<typeof orders.$inferInsert> {
  return {
    paymentMethod: n.paymentMethod,
    pixCode: n.pixCode,
    pixQrUrl: n.pixQrUrl,
    pixExpiresAt: n.pixExpiresAt,
    paymentUrl: n.paymentUrl,
    customerName: n.customer.name,
    customerEmail: n.customer.email?.toLowerCase() ?? null,
    customerPhone: n.customer.phone,
    customerDocumentEnc: encryptDocument(n.customer.document),
    addressLine1: n.address.line1,
    addressLine2: n.address.line2,
    addressNeighborhood: n.address.neighborhood,
    addressCity: n.address.city,
    addressState: n.address.state,
    addressPostalCode: n.address.postalCode,
    addressCountry: n.address.country ?? "Brasil",
    items: n.items,
    amountTotal: n.amountTotal !== null ? n.amountTotal.toFixed(2) : null,
    utm: n.utm ?? undefined,
    paymentStatus: n.paymentStatus ?? undefined,
  };
}

export type { Order };
