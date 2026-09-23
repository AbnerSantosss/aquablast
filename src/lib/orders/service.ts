import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, orderAccessCodes, orderEvents, orders, type Order, type OrderEvent, type OrderStatus } from "@/db/schema";
import { decryptText, encryptText, generateAccessCode, hashAccessCode } from "@/lib/crypto";
import { getSetting } from "@/lib/settings";
import { STATUS_EVENT_TEXT, STATUS_TIMESTAMP_FIELD, canTransition } from "./status";

/** Snapshot público, exatamente no formato que a página /rastrear (tracking-api) espera. */
export interface PublicOrder {
  id: string;
  revision: number;
  status: OrderStatus;
  updatedAt: string;
  createdAt: string;
  approvedAt: string | null;
  shippedAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  buyer: { name: string };
  deliveryAddress: {
    line1: string;
    line2: string;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  tracking: { code: string; carrier: string; url?: string | null };
  events: { id: string; occurredAt: string; title: string; description: string }[];
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toPublicOrder(order: Order, events: OrderEvent[]): PublicOrder {
  return {
    id: order.id,
    revision: order.revision,
    status: order.status,
    updatedAt: order.updatedAt.toISOString(),
    createdAt: order.createdAt.toISOString(),
    approvedAt: iso(order.approvedAt),
    shippedAt: iso(order.shippedAt),
    outForDeliveryAt: iso(order.outForDeliveryAt),
    deliveredAt: iso(order.deliveredAt),
    buyer: { name: order.customerName ?? "" },
    deliveryAddress: {
      line1: order.addressLine1 ?? "",
      line2: order.addressLine2 ?? "",
      neighborhood: order.addressNeighborhood ?? "",
      city: order.addressCity ?? "",
      state: order.addressState ?? "",
      postalCode: order.addressPostalCode ?? "",
      country: order.addressCountry ?? "Brasil",
    },
    tracking: { code: order.trackingCode ?? "", carrier: order.carrierName ?? "", url: order.trackingUrl },
    events: events
      .slice()
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map((e) => ({ id: e.id, occurredAt: e.occurredAt.toISOString(), title: e.title, description: e.description })),
  };
}

export async function getOrderById(id: string): Promise<Order | null> {
  return (await db.query.orders.findFirst({ where: eq(orders.id, id) })) ?? null;
}

export async function getOrderEvents(orderId: string): Promise<OrderEvent[]> {
  return db.query.orderEvents.findMany({ where: eq(orderEvents.orderId, orderId), orderBy: [desc(orderEvents.occurredAt)] });
}

export async function getPublicOrder(orderId: string): Promise<PublicOrder | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;
  return toPublicOrder(order, await getOrderEvents(orderId));
}

async function bump(orderId: string, patch: Partial<typeof orders.$inferInsert> = {}) {
  await db
    .update(orders)
    .set({ ...patch, revision: sql`${orders.revision} + 1`, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

export interface AddEventInput {
  orderId: string;
  title: string;
  description?: string;
  occurredAt?: Date;
  source?: "checkout" | "tracking" | "admin" | "system";
  status?: OrderStatus | null;
  dedupeKey?: string | null;
  raw?: unknown;
}

/** Insere um evento na linha do tempo. Retorna null se a dedupeKey já existia. */
export async function addOrderEvent(input: AddEventInput): Promise<OrderEvent | null> {
  const [row] = await db
    .insert(orderEvents)
    .values({
      orderId: input.orderId,
      title: input.title,
      description: input.description ?? "",
      occurredAt: input.occurredAt ?? new Date(),
      source: input.source ?? "system",
      status: input.status ?? null,
      dedupeKey: input.dedupeKey ?? null,
      raw: input.raw as object | undefined,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return null;
  await bump(input.orderId);
  return row;
}

export interface TransitionInput {
  orderId: string;
  to: OrderStatus;
  source: "checkout" | "tracking" | "admin" | "system";
  actor?: string;
  /** Data real do fato (ex.: evento da transportadora), não a hora de processamento. */
  occurredAt?: Date;
  title?: string;
  description?: string;
  force?: boolean;
  dedupeKey?: string | null;
}

export type TransitionResult = { ok: true; order: Order; changed: boolean } | { ok: false; reason: string };

/** Muda o status respeitando a regra de progressão; grava evento, timestamp e revisão. */
export async function transitionOrder(input: TransitionInput): Promise<TransitionResult> {
  const order = await getOrderById(input.orderId);
  if (!order) return { ok: false, reason: "Pedido não encontrado" };
  if (order.status === input.to) return { ok: true, order, changed: false };
  if (!canTransition(order.status, input.to, { force: input.force })) {
    return { ok: false, reason: `Transição ${order.status} → ${input.to} não permitida` };
  }
  const text = STATUS_EVENT_TEXT[input.to];
  const when = input.occurredAt ?? new Date();
  const patch: Partial<typeof orders.$inferInsert> = { status: input.to };
  const field = STATUS_TIMESTAMP_FIELD[input.to];
  if (field && !order[field]) patch[field] = when;

  await db.insert(orderEvents).values({
    orderId: order.id,
    title: input.title ?? text.title,
    description: input.description ?? text.description,
    occurredAt: when,
    source: input.source,
    status: input.to,
    dedupeKey: input.dedupeKey ?? null,
  }).onConflictDoNothing();
  await bump(order.id, patch);
  if (input.actor) {
    await db.insert(auditLog).values({
      actor: input.actor,
      action: "order.status",
      targetType: "order",
      targetId: order.id,
      detail: { from: order.status, to: input.to, force: !!input.force },
    });
  }
  const updated = (await getOrderById(order.id))!;
  return { ok: true, order: updated, changed: true };
}

export async function updateOrderFields(orderId: string, patch: Partial<typeof orders.$inferInsert>, actor?: string): Promise<void> {
  await bump(orderId, patch);
  if (actor) {
    await db.insert(auditLog).values({ actor, action: "order.update", targetType: "order", targetId: orderId, detail: { fields: Object.keys(patch) } });
  }
}

// ---------- Código de acesso do comprador ----------

/**
 * Gera um novo código de acesso, revoga os anteriores e devolve o código em claro
 * (só existe neste retorno e no e-mail que for enviado).
 */
export async function issueAccessCode(orderId: string, actor = "system"): Promise<{ code: string; expiresAt: Date }> {
  const days = await getSetting("accessCode.validityDays");
  const code = generateAccessCode();
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  await db.update(orderAccessCodes).set({ revokedAt: new Date() }).where(and(eq(orderAccessCodes.orderId, orderId), isNull(orderAccessCodes.revokedAt)));
  await db.insert(orderAccessCodes).values({ orderId, codeHash: hashAccessCode(code), prefix: code.slice(0, 9), expiresAt });
  await db.insert(auditLog).values({ actor, action: "order.access_code.issue", targetType: "order", targetId: orderId });
  return { code, expiresAt };
}

/** Localiza o pedido pelo código digitado. Retorna null para código inválido, expirado ou revogado. */
export async function resolveAccessCode(input: string): Promise<{ order: Order; codeId: string } | null> {
  const hash = hashAccessCode(input);
  const row = await db.query.orderAccessCodes.findFirst({
    where: and(eq(orderAccessCodes.codeHash, hash), isNull(orderAccessCodes.revokedAt), gt(orderAccessCodes.expiresAt, new Date())),
  });
  if (!row) return null;
  const order = await getOrderById(row.orderId);
  if (!order) return null;
  await db
    .update(orderAccessCodes)
    .set({ lastUsedAt: new Date(), useCount: sql`${orderAccessCodes.useCount} + 1` })
    .where(eq(orderAccessCodes.id, row.id));
  return { order, codeId: row.id };
}

export async function activeAccessCodePrefix(orderId: string): Promise<string | null> {
  const row = await db.query.orderAccessCodes.findFirst({
    where: and(eq(orderAccessCodes.orderId, orderId), isNull(orderAccessCodes.revokedAt)),
    orderBy: [desc(orderAccessCodes.createdAt)],
  });
  return row?.prefix ?? null;
}

// ---------- CPF cifrado ----------

export function encryptDocument(doc: string | null | undefined): string | null {
  const digits = (doc ?? "").replace(/\D/g, "");
  return digits ? encryptText(digits) : null;
}

/** Devolve o CPF mascarado (***.***.789-01) para exibição no painel. */
export function maskedDocument(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try {
    const d = decryptText(enc);
    if (d.length !== 11) return "•••" + d.slice(-4);
    return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
  } catch {
    return null;
  }
}

/** Gera número de pedido legível quando o checkout não mandar um: AQB-AAMMDD-XXXX */
export function generateOrderNumber(): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rnd = Math.floor(Math.random() * 46_656).toString(36).toUpperCase().padStart(3, "0");
  return `AQB-${ymd}-${rnd}`;
}
