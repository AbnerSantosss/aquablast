"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { orders, webhookDeliveries, type OrderItem, type OrderStatus, type PaymentStatus } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { sendOrderEmail } from "@/lib/email/send";
import { addOrderEvent, encryptDocument, generateOrderNumber, getOrderById, issueAccessCode, transitionOrder, updateOrderFields } from "@/lib/orders/service";
import { STATUS_LABEL, canTransition } from "@/lib/orders/status";
import { actorOf, audit } from "@/lib/admin/audit";
import { bool, isEmail, num, optStr, str, uuid } from "@/lib/admin/form";
import { isOrderStatus, isPaymentStatus } from "@/lib/admin/queries";
import { fail, ok, type ActionResult } from "@/lib/admin/types";

async function loadOrder(formData: FormData) {
  const session = await requireAdmin();
  await ensureBootstrap();
  const id = uuid(formData, "orderId");
  const order = id ? await getOrderById(id) : null;
  return { session, order, actor: actorOf(session) };
}

const refresh = (id: string) => {
  revalidatePath(`/admin/pedidos/${id}`);
  revalidatePath("/admin");
};

// ---------- Comunicação ----------

export async function resendPix(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { order, actor } = await loadOrder(formData);
  if (!order) return fail("Pedido não encontrado.");
  if (!order.pixCode && !order.paymentUrl) return fail("Este pedido não tem código Pix nem link de pagamento salvo.");
  const r = await sendOrderEmail(order, "pix_reminder", { triggeredBy: actor });
  if (!r.ok) return fail(r.error ?? r.skipped ?? "Falha ao enviar.");
  await db
    .update(orders)
    .set({ reminderCount: sql`${orders.reminderCount} + 1`, lastReminderAt: new Date(), updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  await addOrderEvent({ orderId: order.id, title: "Lembrete de Pix reenviado", description: `Enviado manualmente por ${actor}.`, source: "admin" });
  refresh(order.id);
  return ok(`Lembrete de Pix enviado para ${order.customerEmail}.`);
}

export async function resendAccessCode(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { order, actor } = await loadOrder(formData);
  if (!order) return fail("Pedido não encontrado.");
  const { code } = await issueAccessCode(order.id, actor);
  const r = await sendOrderEmail(order, "access_code", { accessCode: code, triggeredBy: actor });
  await addOrderEvent({ orderId: order.id, title: "Novo código de acesso gerado", description: `Gerado por ${actor}. Códigos anteriores foram revogados.`, source: "admin" });
  refresh(order.id);
  if (!r.ok) return fail(`Código gerado, mas o e-mail falhou: ${r.error ?? r.skipped}. Envie manualmente ao cliente.`, { code });
  return ok(`Novo código gerado e enviado para ${order.customerEmail}. Anote se precisar passar por WhatsApp:`, { code });
}

export async function sendConfirmation(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { order, actor } = await loadOrder(formData);
  if (!order) return fail("Pedido não encontrado.");
  const { code } = await issueAccessCode(order.id, actor);
  const r = await sendOrderEmail(order, "order_confirmed", { accessCode: code, triggeredBy: actor });
  await addOrderEvent({ orderId: order.id, title: "E-mail de confirmação enviado", description: `Enviado manualmente por ${actor} com novo código de acesso.`, source: "admin" });
  refresh(order.id);
  if (!r.ok) return fail(`Código gerado, mas o e-mail falhou: ${r.error ?? r.skipped}.`, { code });
  return ok(`Confirmação enviada para ${order.customerEmail} com o código:`, { code });
}

export async function sendShippedEmail(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { order, actor } = await loadOrder(formData);
  if (!order) return fail("Pedido não encontrado.");
  if (!order.trackingCode) return fail("Cadastre o código de rastreio antes de enviar o aviso de envio.");
  const { code } = await issueAccessCode(order.id, actor);
  const r = await sendOrderEmail(order, "shipped", { accessCode: code, triggeredBy: actor });
  await addOrderEvent({ orderId: order.id, title: "Aviso de envio reenviado", description: `Enviado manualmente por ${actor} com novo código de acesso.`, source: "admin" });
  refresh(order.id);
  if (!r.ok) return fail(`Código gerado, mas o e-mail falhou: ${r.error ?? r.skipped}.`, { code });
  return ok(`Aviso de envio enviado para ${order.customerEmail} com o código:`, { code });
}

// ---------- Status / eventos / notas ----------

export async function changeStatus(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { order, actor } = await loadOrder(formData);
  if (!order) return fail("Pedido não encontrado.");
  const to = str(formData, "to", 40);
  if (!isOrderStatus(to)) return fail("Status inválido.");
  const force = bool(formData, "force");
  if (!canTransition(order.status, to as OrderStatus, { force })) {
    return fail(`Transição ${STATUS_LABEL[order.status]} → ${STATUS_LABEL[to as OrderStatus]} não permitida. Marque "Forçar" para sobrescrever.`);
  }
  const r = await transitionOrder({
    orderId: order.id,
    to: to as OrderStatus,
    source: "admin",
    actor,
    force,
    title: optStr(formData, "title", 200) ?? undefined,
    description: optStr(formData, "description", 2000) ?? undefined,
  });
  if (!r.ok) return fail(r.reason);
  if (force) await audit(actor, "order.status.force", { type: "order", id: order.id }, { from: order.status, to });
  // E-mails automáticos ligados ao status (respeitam o toggle do template).
  if (to === "out_for_delivery" || to === "delivered") {
    await sendOrderEmail(r.order, to, { automatic: true, triggeredBy: actor });
  }
  refresh(order.id);
  return ok(`Status alterado para "${STATUS_LABEL[to as OrderStatus]}".`);
}

export async function addManualEvent(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { order, actor } = await loadOrder(formData);
  if (!order) return fail("Pedido não encontrado.");
  const title = str(formData, "title", 200);
  if (!title) return fail("Informe o título do evento.");
  await addOrderEvent({ orderId: order.id, title, description: str(formData, "description", 2000), source: "admin", raw: { by: actor } });
  refresh(order.id);
  return ok("Evento adicionado à linha do tempo.");
}

export async function saveNotes(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { order, actor } = await loadOrder(formData);
  if (!order) return fail("Pedido não encontrado.");
  await updateOrderFields(order.id, { adminNotes: str(formData, "adminNotes", 10_000) || null }, actor);
  refresh(order.id);
  return ok("Notas salvas.");
}

export async function updatePayment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { order, actor } = await loadOrder(formData);
  if (!order) return fail("Pedido não encontrado.");
  const ps = str(formData, "paymentStatus", 30);
  if (!isPaymentStatus(ps)) return fail("Situação de pagamento inválida.");
  const patch: Partial<typeof orders.$inferInsert> = { paymentStatus: ps as PaymentStatus };
  if (ps === "paid" && !order.paidAt) patch.paidAt = new Date();
  await updateOrderFields(order.id, patch, actor);
  await audit(actor, "order.payment.manual", { type: "order", id: order.id }, { from: order.paymentStatus, to: ps });
  await addOrderEvent({ orderId: order.id, title: "Pagamento atualizado manualmente", description: `${order.paymentStatus} → ${ps} (por ${actor})`, source: "admin" });
  if (ps === "paid" && canTransition(order.status, "approved")) {
    await transitionOrder({ orderId: order.id, to: "approved", source: "admin", actor });
  }
  refresh(order.id);
  return ok("Pagamento atualizado.");
}

// ---------- Criação manual ----------

function parseItems(raw: string): OrderItem[] {
  // Uma linha por item: "2x AquaBlast Azul | 129.90"  (quantidade e preço opcionais)
  const items: OrderItem[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    const [left, price] = l.split("|").map((s) => s.trim());
    const m = /^(\d+)\s*[xX×]\s*(.+)$/.exec(left);
    const quantity = m ? Number(m[1]) : 1;
    const name = (m ? m[2] : left).trim().slice(0, 200);
    if (!name) continue;
    const unitPrice = price ? Number(price.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".")) : null;
    items.push({ name, quantity: Math.max(1, quantity), unitPrice: unitPrice !== null && Number.isFinite(unitPrice) ? unitPrice : null });
  }
  return items;
}

export async function createManualOrder(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  await ensureBootstrap();
  const actor = actorOf(session);

  const fields: Record<string, string> = {};
  const customerName = str(formData, "customerName", 200);
  const customerEmail = str(formData, "customerEmail", 254).toLowerCase();
  if (!customerName) fields.customerName = "Informe o nome do cliente.";
  if (customerEmail && !isEmail(customerEmail)) fields.customerEmail = "E-mail inválido.";
  const paymentStatus = str(formData, "paymentStatus", 30);
  if (!isPaymentStatus(paymentStatus)) fields.paymentStatus = "Situação inválida.";
  const items = parseItems(str(formData, "items", 5000));
  if (!items.length) fields.items = "Informe ao menos um item (um por linha).";
  if (Object.keys(fields).length) return fail("Corrija os campos destacados.", { fields });

  let orderNumber = str(formData, "orderNumber", 60) || generateOrderNumber();
  const existing = await db.query.orders.findFirst({ where: eq(orders.orderNumber, orderNumber), columns: { id: true } });
  if (existing) {
    if (str(formData, "orderNumber", 60)) return fail("Já existe um pedido com este número.", { fields: { orderNumber: "Número em uso." } });
    orderNumber = generateOrderNumber();
  }

  const amount = num(formData, "amountTotal");
  const paid = paymentStatus === "paid";
  const [created] = await db
    .insert(orders)
    .values({
      orderNumber,
      externalId: optStr(formData, "externalId", 120),
      checkoutProvider: "manual",
      status: paid ? "approved" : "created",
      paymentStatus: paymentStatus as PaymentStatus,
      paymentMethod: optStr(formData, "paymentMethod", 40)?.toLowerCase() ?? null,
      pixCode: optStr(formData, "pixCode", 2000),
      paymentUrl: optStr(formData, "paymentUrl", 1000),
      customerName,
      customerEmail: customerEmail || null,
      customerPhone: optStr(formData, "customerPhone", 40),
      customerDocumentEnc: encryptDocument(optStr(formData, "customerDocument", 20)),
      addressLine1: optStr(formData, "addressLine1", 200),
      addressLine2: optStr(formData, "addressLine2", 200),
      addressNeighborhood: optStr(formData, "addressNeighborhood", 120),
      addressCity: optStr(formData, "addressCity", 120),
      addressState: optStr(formData, "addressState", 40),
      addressPostalCode: optStr(formData, "addressPostalCode", 20),
      addressCountry: optStr(formData, "addressCountry", 60) ?? "Brasil",
      items,
      amountTotal: amount !== null ? amount.toFixed(2) : null,
      paidAt: paid ? new Date() : null,
      approvedAt: paid ? new Date() : null,
      adminNotes: optStr(formData, "adminNotes", 10_000),
    })
    .returning();

  await addOrderEvent({ orderId: created.id, title: "Pedido recebido", description: `Pedido cadastrado manualmente por ${actor}.`, source: "admin", status: "created" });
  if (paid) await addOrderEvent({ orderId: created.id, title: "Pagamento aprovado", description: "Pagamento informado manualmente no painel.", source: "admin", status: "approved" });
  await audit(actor, "order.manual.create", { type: "order", id: created.id }, { orderNumber, paymentStatus });

  const deliveryId = uuid(formData, "deliveryId");
  if (deliveryId) {
    await db
      .update(webhookDeliveries)
      .set({ orderId: created.id, status: "processed", detail: `Pedido ${orderNumber} criado manualmente por ${actor}.`, processedAt: new Date() })
      .where(eq(webhookDeliveries.id, deliveryId));
    revalidatePath("/admin/webhooks");
  }

  if (paid && customerEmail && bool(formData, "sendConfirmation")) {
    const { code } = await issueAccessCode(created.id, actor);
    await sendOrderEmail(created, "order_confirmed", { accessCode: code, triggeredBy: actor });
  }

  revalidatePath("/admin");
  redirect(`/admin/pedidos/${created.id}?ok=${encodeURIComponent(`Pedido ${orderNumber} criado.`)}`);
}

export async function linkWebhookToOrder(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  await ensureBootstrap();
  const actor = actorOf(session);
  const deliveryId = uuid(formData, "deliveryId");
  if (!deliveryId) return fail("Webhook inválido.");
  const n = str(formData, "orderNumber", 80);
  if (!n) return fail("Informe o número do pedido.");
  const order = await db.query.orders.findFirst({ where: eq(orders.orderNumber, n) });
  if (!order) return fail(`Pedido "${n}" não encontrado.`);
  await db
    .update(webhookDeliveries)
    .set({ orderId: order.id, status: "processed", detail: `Vinculado manualmente ao pedido ${order.orderNumber} por ${actor}.`, processedAt: new Date() })
    .where(eq(webhookDeliveries.id, deliveryId));
  await addOrderEvent({ orderId: order.id, title: "Webhook vinculado", description: `Entrega de webhook ${deliveryId.slice(0, 8)} vinculada por ${actor}.`, source: "admin", raw: { deliveryId } });
  await audit(actor, "webhook.link", { type: "webhook_delivery", id: deliveryId }, { orderId: order.id });
  revalidatePath("/admin/webhooks");
  revalidatePath(`/admin/webhooks/${deliveryId}`);
  return ok(`Vinculado ao pedido ${order.orderNumber}.`);
}
