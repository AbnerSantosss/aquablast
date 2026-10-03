"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { sendOrderEmail } from "@/lib/email/send";
import { addOrderEvent, ensureAccessCode, getOrderById, transitionOrder, updateOrderFields } from "@/lib/orders/service";
import { canTransition, rank } from "@/lib/orders/status";
import { getSetting } from "@/lib/settings";
import { CARRIERS, carrierName, carrierUrl, getTrackingProvider } from "@/lib/tracking/provider";
import { syncOrderTracking } from "@/lib/tracking/sync";
import { actorOf } from "@/lib/admin/audit";
import { optStr, str, uuid } from "@/lib/admin/form";
import { fail, ok, type ActionResult } from "@/lib/admin/types";

export async function saveTracking(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  await ensureBootstrap();
  const actor = actorOf(session);
  const id = uuid(formData, "orderId");
  const order = id ? await getOrderById(id) : null;
  if (!order) return fail("Pedido não encontrado.");

  const trackingCode = str(formData, "trackingCode", 80).replace(/\s+/g, "").toUpperCase();
  if (!trackingCode) return fail("Informe o código de rastreio.");
  const carrierRaw = Number(str(formData, "carrierCode", 20));
  const carrierCode = CARRIERS.some((c) => c.code === carrierRaw) ? carrierRaw : await getSetting("tracking.17track.defaultCarrier");
  const urlOverride = optStr(formData, "trackingUrl", 1000);
  if (urlOverride && !/^https?:\/\//i.test(urlOverride)) return fail("A URL de rastreio precisa começar com http:// ou https://");

  const providerKind = await getSetting("tracking.provider");
  await updateOrderFields(
    order.id,
    {
      trackingCode,
      carrierCode: String(carrierCode),
      carrierName: carrierName(carrierCode) ?? order.carrierName ?? null,
      trackingUrl: urlOverride ?? carrierUrl(carrierCode, trackingCode),
      trackingProvider: providerKind,
      trackingSyncError: null,
    },
    actor,
  );

  const notes: string[] = [];
  try {
    const provider = await getTrackingProvider();
    const reg = await provider.register(trackingCode, carrierCode, order.orderNumber);
    if (reg.ok) {
      await updateOrderFields(order.id, { trackingRegisteredAt: new Date() });
      notes.push(reg.message ? `Registro no provedor: ${reg.message}` : "Registrado no provedor de rastreio.");
    } else {
      notes.push(`Provedor recusou o registro: ${reg.message ?? "motivo desconhecido"}.`);
      await updateOrderFields(order.id, { trackingSyncError: reg.message ?? "registro recusado" });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notes.push(`Falha ao registrar no provedor: ${message}`);
    await updateOrderFields(order.id, { trackingSyncError: message });
  }

  const changed = order.trackingCode !== trackingCode;
  if (changed) {
    await addOrderEvent({
      orderId: order.id,
      title: order.trackingCode ? "Código de rastreio alterado" : "Código de rastreio cadastrado",
      description: `${trackingCode} (${carrierName(carrierCode) ?? "transportadora"}) por ${actor}.`,
      source: "admin",
    });
  }

  let current = (await getOrderById(order.id))!;
  if (rank(current.status) < rank("shipped") && canTransition(current.status, "shipped")) {
    const t = await transitionOrder({ orderId: current.id, to: "shipped", source: "admin", actor });
    if (t.ok) {
      current = t.order;
      notes.push('Status alterado para "Enviado".');
    }
  }

  // Feedback do e-mail ao cliente vem primeiro na mensagem: é o que o operador precisa saber na hora
  // (usado igual no detalhe do pedido e na aba Pendentes de /admin/envios).
  let mailSent = false;
  let head: string;
  if (!changed) {
    head = "Rastreio salvo · código igual ao anterior, e-mail não reenviado";
    mailSent = true;
  } else if (!current.customerEmail) {
    head = "Rastreio salvo, e-mail NÃO enviado: pedido sem e-mail do cliente";
  } else {
    // O e-mail de envio repete o código de rastreio do pedido (o mesmo da confirmação).
    const { code } = await ensureAccessCode(current.id, actor);
    const r = await sendOrderEmail(current, "shipped", { automatic: true, accessCode: code, triggeredBy: actor });
    mailSent = r.ok;
    head = r.ok ? `Rastreio salvo · e-mail enviado para ${current.customerEmail}` : `Rastreio salvo, e-mail NÃO enviado: ${r.error ?? r.skipped ?? "motivo desconhecido"}`;
  }

  revalidatePath(`/admin/pedidos/${order.id}`);
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/envios");
  revalidatePath("/admin");
  const message = `${head}. ${notes.join(" ")}`.trim();
  // O rastreio foi gravado nos dois casos; o erro só sinaliza que o cliente não foi avisado.
  return mailSent ? ok(message) : fail(message);
}

export async function syncTrackingNow(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  await ensureBootstrap();
  const id = uuid(formData, "orderId");
  const order = id ? await getOrderById(id) : null;
  if (!order) return fail("Pedido não encontrado.");
  const r = await syncOrderTracking(order);
  revalidatePath(`/admin/pedidos/${order.id}`);
  return r.ok ? ok(`Sincronizado: ${r.message}`) : fail(r.message);
}

export async function clearTracking(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  await ensureBootstrap();
  const actor = actorOf(session);
  const id = uuid(formData, "orderId");
  const order = id ? await getOrderById(id) : null;
  if (!order) return fail("Pedido não encontrado.");
  await updateOrderFields(
    order.id,
    { trackingCode: null, trackingUrl: null, carrierCode: null, carrierName: null, trackingProvider: null, trackingRegisteredAt: null, trackingLastSyncAt: null, trackingLastStatus: null, trackingSyncError: null },
    actor,
  );
  await addOrderEvent({ orderId: order.id, title: "Código de rastreio removido", description: `Removido por ${actor}.`, source: "admin" });
  revalidatePath(`/admin/pedidos/${order.id}`);
  return ok("Rastreio removido do pedido.");
}
