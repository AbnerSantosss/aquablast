import { and, count, desc, eq, gte, ilike, inArray, isNotNull, lt, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, emailLog, orders, webhookDeliveries, type Order, type OrderStatus, type PaymentStatus } from "@/db/schema";
import { getSetting } from "@/lib/settings";
import { dayBounds, startOfDaySP } from "./format";
import { PAGE_SIZE } from "./types";

const ORDER_STATUSES: OrderStatus[] = ["created", "approved", "preparing", "shipped", "in_transit", "out_for_delivery", "delivered", "exception", "cancelled"];
const PAYMENT_STATUSES: PaymentStatus[] = ["pending", "paid", "refused", "refunded", "chargeback", "cancelled", "expired"];

export const isOrderStatus = (v: string): v is OrderStatus => (ORDER_STATUSES as string[]).includes(v);
export const isPaymentStatus = (v: string): v is PaymentStatus => (PAYMENT_STATUSES as string[]).includes(v);

export interface OrderFilters {
  status?: string;
  paymentStatus?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listOrders(f: OrderFilters): Promise<{ rows: Order[]; total: number; page: number; pages: number }> {
  const where: SQL[] = [];
  if (f.status && isOrderStatus(f.status)) where.push(eq(orders.status, f.status));
  if (f.paymentStatus && isPaymentStatus(f.paymentStatus)) where.push(eq(orders.paymentStatus, f.paymentStatus));
  const q = (f.q ?? "").trim().slice(0, 100);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    const digits = q.replace(/\D/g, "");
    const parts: SQL[] = [
      ilike(orders.orderNumber, like),
      ilike(orders.customerName, like),
      ilike(orders.customerEmail, like),
      ilike(orders.trackingCode, like),
      ilike(orders.externalId, like),
    ];
    if (digits.length >= 4) parts.push(ilike(orders.customerPhone, `%${digits}%`));
    else parts.push(ilike(orders.customerPhone, like));
    where.push(or(...parts)!);
  }
  const from = f.from ? dayBounds(f.from) : null;
  const to = f.to ? dayBounds(f.to) : null;
  if (from) where.push(gte(orders.createdAt, from.start));
  if (to) where.push(lt(orders.createdAt, to.end));

  const cond = where.length ? and(...where) : undefined;
  const [{ value: total }] = await db.select({ value: count() }).from(orders).where(cond);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, f.page ?? 1));
  const rows = await db.query.orders.findMany({
    where: cond,
    orderBy: [desc(orders.createdAt)],
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  return { rows, total, page, pages };
}

export interface Kpis {
  today: number;
  awaitingPayment: number;
  paid: number;
  shipped: number;
  delivered: number;
  pixLate: number;
  pixLateMinutes: number;
}

export async function getKpis(): Promise<Kpis> {
  const afterMinutes = await getSetting("email.pixReminder.afterMinutes");
  const threshold = Math.max(afterMinutes || 60, 1);
  const since = new Date(Date.now() - threshold * 60_000);
  const c = async (cond: SQL) => (await db.select({ value: count() }).from(orders).where(cond))[0].value;
  const [today, awaitingPayment, paid, shipped, delivered, pixLate] = await Promise.all([
    c(gte(orders.createdAt, startOfDaySP())),
    c(and(eq(orders.paymentStatus, "pending"), ne(orders.status, "cancelled"))!),
    c(eq(orders.paymentStatus, "paid")),
    c(inArray(orders.status, ["shipped", "in_transit", "out_for_delivery"])),
    c(eq(orders.status, "delivered")),
    c(and(eq(orders.paymentStatus, "pending"), eq(orders.paymentMethod, "pix"), ne(orders.status, "cancelled"), lt(orders.createdAt, since))!),
  ]);
  return { today, awaitingPayment, paid, shipped, delivered, pixLate, pixLateMinutes: threshold };
}

export async function findOrderByNumber(orderNumber: string): Promise<Order | null> {
  const n = orderNumber.trim();
  if (!n) return null;
  return (await db.query.orders.findFirst({ where: or(eq(orders.orderNumber, n), eq(orders.externalId, n)) })) ?? null;
}

// ---------- Webhooks ----------

const WEBHOOK_STATUSES = ["received", "processed", "ignored", "unmapped", "error", "unauthorized"] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];
export const isWebhookStatus = (v: string): v is WebhookStatus => (WEBHOOK_STATUSES as readonly string[]).includes(v);

export async function listWebhooks(f: { status?: string; source?: string; page?: number }) {
  const where: SQL[] = [];
  if (f.status && isWebhookStatus(f.status)) where.push(eq(webhookDeliveries.status, f.status));
  if (f.source === "checkout" || f.source === "tracking") where.push(eq(webhookDeliveries.source, f.source));
  const cond = where.length ? and(...where) : undefined;
  const [{ value: total }] = await db.select({ value: count() }).from(webhookDeliveries).where(cond);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, f.page ?? 1));
  const rows = await db
    .select({
      id: webhookDeliveries.id,
      source: webhookDeliveries.source,
      provider: webhookDeliveries.provider,
      receivedAt: webhookDeliveries.receivedAt,
      status: webhookDeliveries.status,
      detail: webhookDeliveries.detail,
      orderId: webhookDeliveries.orderId,
      orderNumber: orders.orderNumber,
      payload: webhookDeliveries.payload,
    })
    .from(webhookDeliveries)
    .leftJoin(orders, eq(orders.id, webhookDeliveries.orderId))
    .where(cond)
    .orderBy(desc(webhookDeliveries.receivedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const [{ value: unmapped }] = await db.select({ value: count() }).from(webhookDeliveries).where(eq(webhookDeliveries.status, "unmapped"));
  return { rows, total, page, pages, unmapped };
}

export async function getWebhook(id: string) {
  return (await db.query.webhookDeliveries.findFirst({ where: eq(webhookDeliveries.id, id) })) ?? null;
}

// ---------- E-mails ----------

export async function listEmails(f: { status?: string; template?: string; q?: string; page?: number }) {
  const where: SQL[] = [];
  if (f.status === "sent" || f.status === "error") where.push(eq(emailLog.status, f.status));
  if (f.template) where.push(eq(emailLog.templateKey, f.template.slice(0, 50)));
  const q = (f.q ?? "").trim().slice(0, 100);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    where.push(or(ilike(emailLog.to, like), ilike(emailLog.subject, like), ilike(orders.orderNumber, like))!);
  }
  const cond = where.length ? and(...where) : undefined;
  const [{ value: total }] = await db.select({ value: count() }).from(emailLog).leftJoin(orders, eq(orders.id, emailLog.orderId)).where(cond);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, f.page ?? 1));
  const rows = await db
    .select({
      id: emailLog.id,
      orderId: emailLog.orderId,
      orderNumber: orders.orderNumber,
      to: emailLog.to,
      templateKey: emailLog.templateKey,
      subject: emailLog.subject,
      provider: emailLog.provider,
      status: emailLog.status,
      error: emailLog.error,
      triggeredBy: emailLog.triggeredBy,
      sentAt: emailLog.sentAt,
    })
    .from(emailLog)
    .leftJoin(orders, eq(orders.id, emailLog.orderId))
    .where(cond)
    .orderBy(desc(emailLog.sentAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { rows, total, page, pages };
}

export async function listOrderEmails(orderId: string) {
  return db.query.emailLog.findMany({ where: eq(emailLog.orderId, orderId), orderBy: [desc(emailLog.sentAt)], limit: 50 });
}

export async function listOrderWebhooks(orderId: string) {
  return db.query.webhookDeliveries.findMany({
    where: and(eq(webhookDeliveries.orderId, orderId), isNotNull(webhookDeliveries.orderId)),
    orderBy: [desc(webhookDeliveries.receivedAt)],
    limit: 20,
    columns: { id: true, source: true, provider: true, receivedAt: true, status: true, detail: true },
  });
}

// ---------- Administradores ----------

export async function listAdmins() {
  return db.query.adminUsers.findMany({
    orderBy: [adminUsers.createdAt],
    columns: { id: true, email: true, name: true, createdAt: true, lastLoginAt: true, disabledAt: true },
  });
}
