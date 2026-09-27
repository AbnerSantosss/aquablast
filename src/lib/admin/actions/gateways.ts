"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { actorOf, audit } from "@/lib/admin/audit";
import { str } from "@/lib/admin/form";
import { fail, ok, type ActionResult } from "@/lib/admin/types";
import { getGateway, isGatewayName } from "@/lib/gateways";
import { getOrderById } from "@/lib/orders/service";
import { applyPaymentStatus } from "@/lib/orders/payment";
import { db } from "@/db";
import { paymentAttempts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isSecretKey, setSetting, type SettingKey, type SettingsMap } from "@/lib/settings";

/**
 * Ações da tela Gateways (fase 11.8): roteamento (`gateway.pix`/`gateway.card`), credenciais de cada
 * gateway (IronPay, Mercado Pago, FastPay), token do postback e modo do checkout (`checkout.mode`).
 * Mesma regra de segredo das demais telas: campo de segredo em branco = mantém o valor atual.
 */

type Patch = Partial<SettingsMap>;

async function begin() {
  const session = await requireAdmin();
  await ensureBootstrap();
  return { actor: actorOf(session) };
}

async function apply(actor: string, section: string, patch: Patch): Promise<void> {
  const changed: string[] = [];
  for (const [k, v] of Object.entries(patch) as [SettingKey, SettingsMap[SettingKey]][]) {
    if (isSecretKey(k) && (v === "" || v === undefined || v === null)) continue;
    await setSetting(k, v as never, actor);
    changed.push(k);
  }
  await audit(actor, "settings.update", { type: "settings", id: section }, { keys: changed });
  revalidatePath("/admin/gateways");
}

export async function saveRoutingSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const pix = str(fd, "gateway.pix", 20);
  const card = str(fd, "gateway.card", 20);
  if (!isGatewayName(pix)) return fail("Escolha um gateway válido para o Pix.");
  if (card !== "desligado" && !isGatewayName(card)) return fail("Escolha um gateway válido para o cartão (ou desligado).");
  await apply(actor, "gateway.routing", {
    "gateway.pix": pix as SettingsMap["gateway.pix"],
    "gateway.card": card as SettingsMap["gateway.card"],
  });
  return ok("Roteamento de pagamento salvo.");
}

export async function saveIronpaySettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  await apply(actor, "gateway.ironpay", {
    "gateway.ironpay.apiToken": str(fd, "gateway.ironpay.apiToken", 500),
    "gateway.ironpay.offerHashUnit": str(fd, "gateway.ironpay.offerHashUnit", 200),
    "gateway.ironpay.offerHashKit": str(fd, "gateway.ironpay.offerHashKit", 200),
    "gateway.ironpay.productHashUnit": str(fd, "gateway.ironpay.productHashUnit", 200),
    "gateway.ironpay.productHashKit": str(fd, "gateway.ironpay.productHashKit", 200),
  });
  return ok("Credenciais da IronPay salvas. Segredo em branco foi mantido.");
}

export async function saveMercadopagoSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  await apply(actor, "gateway.mercadopago", {
    "gateway.mercadopago.accessToken": str(fd, "gateway.mercadopago.accessToken", 500),
    "gateway.mercadopago.publicKey": str(fd, "gateway.mercadopago.publicKey", 300),
    "gateway.mercadopago.webhookSecret": str(fd, "gateway.mercadopago.webhookSecret", 500),
  });
  return ok("Credenciais do Mercado Pago salvas. Segredos em branco foram mantidos.");
}

export async function saveFastpaySettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  await apply(actor, "gateway.fastpay", {
    "gateway.fastpay.apiKey": str(fd, "gateway.fastpay.apiKey", 500),
  });
  return ok("Credencial da FastPay salva. Segredo em branco foi mantido.");
}

/** Gera um novo token aleatório para a URL do postback (`/api/webhooks/gateway/<provider>/<token>`). */
export async function regeneratePostbackToken(_prev: ActionResult, _fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const token = randomBytes(24).toString("hex");
  await setSetting("gateway.postbackToken", token, actor);
  await audit(actor, "settings.update", { type: "settings", id: "gateway.postbackToken" }, { keys: ["gateway.postbackToken"] });
  revalidatePath("/admin/gateways");
  return ok("Novo token do postback gerado. Atualize a URL cadastrada no painel de cada gateway.");
}

export async function saveCheckoutModeSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const mode = str(fd, "checkout.mode", 10);
  if (mode !== "proprio" && mode !== "zedy") return fail("Modo inválido.");
  await setSetting("checkout.mode", mode, actor);
  await audit(actor, "settings.update", { type: "settings", id: "checkout.mode" }, { keys: ["checkout.mode"] });
  revalidatePath("/admin/gateways");
  revalidatePath("/admin/configuracoes");
  return ok(mode === "proprio" ? "Checkout próprio ativado: os links de compra do site vão para /checkout." : "Checkout Zedy ativado: os links de compra voltam para a Zedy.");
}

/**
 * Estorno manual (usado em pedidos/[id]). Busca a tentativa de pagamento paga mais recente do pedido,
 * chama `gateway.refund()` e, se o gateway confirmar, aplica o status "refunded" com applyPaymentStatus
 * (fonte "admin"). A FastPay não tem estorno por API: o gateway devolve `ok:false` com uma mensagem
 * orientando a fazer pelo painel da FastPay.
 */
export async function refundOrderPayment(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const orderId = str(fd, "orderId", 64);
  if (!orderId) return fail("Pedido não informado.");
  const order = await getOrderById(orderId);
  if (!order) return fail("Pedido não encontrado.");
  if (order.checkoutProvider !== "proprio") return fail("Este pedido não foi pago pelo checkout próprio.");
  if (order.paymentStatus !== "paid") return fail("Só é possível estornar um pedido com pagamento confirmado.");

  const attempt = await db.query.paymentAttempts.findFirst({
    where: eq(paymentAttempts.orderId, orderId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  if (!attempt || attempt.status !== "paid" || !attempt.providerTransactionId) {
    return fail("Não foi encontrada uma tentativa de pagamento confirmada para este pedido.");
  }
  if (!isGatewayName(attempt.provider)) return fail("Gateway da tentativa de pagamento não é reconhecido.");

  const gw = getGateway(attempt.provider);
  const res = await gw.refund(attempt.providerTransactionId, attempt.amountCents);
  if (!res.ok) return fail(res.message ?? "O gateway recusou o estorno.");

  await db.update(paymentAttempts).set({ status: "refunded", statusReason: "estornado pelo painel", updatedAt: new Date() }).where(eq(paymentAttempts.id, attempt.id));
  await applyPaymentStatus({ orderId, paymentStatus: "refunded", source: "admin", dedupeKey: `admin:refund:${attempt.id}` });
  await audit(actor, "order.refund", { type: "order", id: orderId }, { provider: attempt.provider, amountCents: attempt.amountCents });
  revalidatePath(`/admin/pedidos/${orderId}`);
  return ok("Estorno realizado.");
}
