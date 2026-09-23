import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, type Order } from "@/db/schema";
import { sendOrderEmail } from "@/lib/email/send";
import { addOrderEvent, transitionOrder, updateOrderFields } from "@/lib/orders/service";
import { rank } from "@/lib/orders/status";
import { getTrackingProvider, type TrackingSnapshot } from "./provider";

/**
 * Aplica um snapshot da transportadora a um pedido:
 * - insere eventos novos (dedupe por chave),
 * - avança o status só para frente (nunca por tempo decorrido),
 * - dispara e-mails de "saiu para entrega" e "entregue" quando o status muda.
 */
export async function applySnapshot(order: Order, snap: TrackingSnapshot): Promise<{ newEvents: number; statusChanged: boolean }> {
  let newEvents = 0;
  let statusChanged = false;
  let current = order;

  for (const ev of snap.events) {
    const inserted = await addOrderEvent({
      orderId: order.id,
      title: ev.title,
      description: ev.description,
      occurredAt: ev.occurredAt,
      source: "tracking",
      status: ev.status ?? null,
      dedupeKey: `t:${ev.key}`,
    });
    if (inserted) newEvents++;
  }

  // Status agregado: primeiro o mais recente reportado; se não houver, o maior entre os eventos.
  const candidates = [snap.status, ...snap.events.map((e) => e.status)].filter((s): s is NonNullable<typeof s> => !!s);
  let target = candidates.find((s) => s === "exception" && snap.status === "exception") ?? null;
  if (!target) {
    for (const c of candidates) {
      if (c === "exception") continue;
      if (!target || rank(c) > rank(target)) target = c;
    }
  }
  if (target && target !== current.status) {
    const lastEvent = snap.events[snap.events.length - 1];
    const res = await transitionOrder({ orderId: order.id, to: target, source: "tracking", occurredAt: lastEvent?.occurredAt, dedupeKey: `ts:${target}:${lastEvent?.key ?? "x"}` });
    if (res.ok && res.changed) {
      statusChanged = true;
      current = res.order;
      if (target === "out_for_delivery") await sendOrderEmail(current, "out_for_delivery", { automatic: true });
      if (target === "delivered") await sendOrderEmail(current, "delivered", { automatic: true });
    }
  }

  await updateOrderFields(order.id, {
    trackingLastSyncAt: new Date(),
    trackingLastStatus: snap.rawStatus,
    trackingSyncError: null,
    carrierName: current.carrierName ?? snap.carrierName ?? undefined,
    carrierCode: current.carrierCode ?? snap.carrierCode ?? undefined,
  });
  return { newEvents, statusChanged };
}

/** Consulta o provedor para um pedido e aplica o resultado. */
export async function syncOrderTracking(order: Order): Promise<{ ok: boolean; message: string }> {
  if (!order.trackingCode) return { ok: false, message: "Pedido sem código de rastreio" };
  try {
    const provider = await getTrackingProvider();
    const snap = await provider.fetch(order.trackingCode, order.carrierCode ? Number(order.carrierCode) : null);
    if (!snap) {
      await updateOrderFields(order.id, { trackingLastSyncAt: new Date(), trackingSyncError: "Provedor não retornou dados (código ainda não indexado?)" });
      return { ok: false, message: "Sem dados do provedor ainda" };
    }
    const r = await applySnapshot(order, snap);
    return { ok: true, message: `${r.newEvents} evento(s) novo(s)${r.statusChanged ? ", status atualizado" : ""}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateOrderFields(order.id, { trackingLastSyncAt: new Date(), trackingSyncError: message });
    return { ok: false, message };
  }
}

/** Varre pedidos com rastreio ativo e não finalizados. Usado pelo cron. */
export async function syncAllActive(limit = 50): Promise<{ checked: number; updated: number; errors: number }> {
  const rows = await db.query.orders.findMany({
    where: and(isNotNull(orders.trackingCode), notInArray(orders.status, ["delivered", "cancelled"])),
    limit,
    orderBy: orders.trackingLastSyncAt,
  });
  let updated = 0;
  let errors = 0;
  for (const o of rows) {
    const r = await syncOrderTracking(o);
    if (r.ok) updated++;
    else errors++;
  }
  return { checked: rows.length, updated, errors };
}

/** Localiza o pedido dono de um código de rastreio (usado pelo webhook). */
export async function findOrderByTrackingCode(code: string): Promise<Order | null> {
  return (await db.query.orders.findFirst({ where: eq(orders.trackingCode, code) })) ?? null;
}
