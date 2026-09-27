// SÓ SERVIDOR. E-mails de carrinho abandonado e de pós-pagamento do checkout próprio (plano 10.2/10.3).
import { and, desc, eq, gt, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { checkoutCarts, emailLog, orders, paymentAttempts, type CheckoutCart } from "@/db/schema";
import { selectionFromCart, titleOf, variantOf } from "@/lib/checkout/own/catalog";
import { money } from "@/lib/checkout/own/masks";
import { OWN_PROVIDER } from "@/lib/checkout/own/order";
import { env } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";
import { getSettings } from "@/lib/settings";
import { getEmailProvider } from "./provider";
import { sendOrderEmail, type SendResult } from "./send";
import { escapeHtml, getTemplate, htmlToText, renderTemplate } from "./templates";

export type CartTemplateKey = "cart_abandoned_1" | "cart_abandoned_2" | "cart_abandoned_3";

export interface AbandonedRunResult {
  /** Recuperação desligada no painel (checkout.recovery.enabled = false). Só se aplica a runAbandonedCarts. */
  disabled: boolean;
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
}

function etapaLabel(step: CheckoutCart["step"]): string {
  switch (step) {
    case "dados":
      return "Seus dados";
    case "entrega":
      return "Entrega";
    default:
      return "Pagamento";
  }
}

async function buildCartVars(cart: CheckoutCart, templateKey: CartTemplateKey): Promise<Record<string, string>> {
  const s = await getSettings(["store.name", "store.supportWhatsapp", "store.supportEmail"] as const);
  const base = env().APP_URL.replace(/\/$/, "");
  const sel = selectionFromCart(cart);
  const name = cart.customerName ?? "";
  const linkCarrinho = `${base}/checkout/pedido/${cart.token}?utm_source=email&utm_medium=recuperacao&utm_campaign=${templateKey}`;
  const linkDescadastro = `${base}/checkout/descadastrar/${cart.token}`;
  return {
    nome: escapeHtml(name),
    primeiro_nome: escapeHtml(name.split(/\s+/)[0] ?? ""),
    pedido: "",
    codigo_acesso: "",
    link_rastreio: "",
    codigo_transportadora: "",
    transportadora: "",
    pix_copia_cola: "",
    link_pagamento: "",
    valor: money(cart.amountCents),
    itens: `${escapeHtml(titleOf(sel))} (${escapeHtml(variantOf(sel))})`,
    loja: escapeHtml(s["store.name"]),
    whatsapp: escapeHtml(s["store.supportWhatsapp"]),
    email_suporte: escapeHtml(s["store.supportEmail"]),
    link_carrinho: linkCarrinho,
    etapa: escapeHtml(etapaLabel(cart.step)),
    link_descadastro: linkDescadastro,
  };
}

/**
 * Envia um e-mail de carrinho abandonado. Nunca envia se o carrinho não tiver e-mail, já estiver
 * descadastrado ou já tiver virado pedido (`converted`/`recovered`). `automatic=true` respeita o
 * toggle `enabled` do template (igual a `sendOrderEmail`).
 */
export async function sendCartEmail(
  cart: CheckoutCart,
  templateKey: CartTemplateKey,
  opts: { automatic?: boolean; triggeredBy?: string } = {},
): Promise<SendResult> {
  if (!cart.customerEmail) return { ok: false, skipped: "Carrinho sem e-mail do cliente" };
  if (cart.unsubscribedAt) return { ok: false, skipped: "Carrinho descadastrado" };
  if (cart.status === "converted" || cart.status === "recovered") return { ok: false, skipped: "Carrinho já convertido em pedido" };

  const tpl = await getTemplate(templateKey);
  if (opts.automatic && !tpl.enabled) return { ok: false, skipped: "Envio automático desligado para este template" };

  const vars = await buildCartVars(cart, templateKey);
  const subject = renderTemplate(tpl.subject, vars);
  const html = renderTemplate(tpl.bodyHtml, vars);
  const s = await getSettings(["email.provider", "email.replyTo"] as const);
  const triggeredBy = opts.triggeredBy ?? "system";

  try {
    const provider = await getEmailProvider();
    const { messageId } = await provider.send({ to: cart.customerEmail, subject, html, text: htmlToText(html), replyTo: s["email.replyTo"] });
    await db.insert(emailLog).values({ cartId: cart.id, orderId: null, to: cart.customerEmail, templateKey, subject, provider: provider.kind, status: "sent", messageId, triggeredBy });
    return { ok: true };
  } catch (err) {
    const message = errorMessage(err);
    await db.insert(emailLog).values({ cartId: cart.id, orderId: null, to: cart.customerEmail, templateKey, subject, provider: s["email.provider"], status: "error", error: message, triggeredBy });
    return { ok: false, error: message };
  }
}

/**
 * Roda a fila de lembretes de carrinho abandonado (plano 10.3). Um carrinho entra quando:
 * `checkout.recovery.enabled`, tem e-mail, status `open`/`abandoned`, sem `unsubscribedAt`, sem
 * pedido pago com o mesmo e-mail criado depois do carrinho, e sem Pix pendente ligado (esse caso é
 * do lembrete de Pix). Os 3 tempos (`firstAfterMinutes`/`secondAfterMinutes`/`thirdAfterMinutes`)
 * contam sempre a partir de `lastActivityAt`, nunca do último e-mail.
 */
export async function runAbandonedCarts(limit = 50): Promise<AbandonedRunResult> {
  const result: AbandonedRunResult = { disabled: false, checked: 0, sent: 0, skipped: 0, errors: 0 };
  const s = await getSettings([
    "checkout.recovery.enabled",
    "checkout.recovery.firstAfterMinutes",
    "checkout.recovery.secondAfterMinutes",
    "checkout.recovery.thirdAfterMinutes",
  ] as const);
  if (!s["checkout.recovery.enabled"]) return { ...result, disabled: true };

  const thresholds = [
    s["checkout.recovery.firstAfterMinutes"],
    s["checkout.recovery.secondAfterMinutes"],
    s["checkout.recovery.thirdAfterMinutes"],
  ];
  const positive = thresholds.filter((m) => m > 0);
  if (positive.length === 0) return { ...result, disabled: true };

  const now = new Date();
  const cutoff = new Date(now.getTime() - Math.min(...positive) * 60_000);
  const rows = await db.query.checkoutCarts.findMany({
    where: and(
      isNotNull(checkoutCarts.customerEmail),
      isNull(checkoutCarts.unsubscribedAt),
      lt(checkoutCarts.recoveryEmailCount, 3),
      lt(checkoutCarts.lastActivityAt, cutoff),
    ),
    orderBy: checkoutCarts.lastActivityAt,
    limit: limit * 3,
  });

  const eligible = rows.filter((c) => c.status === "open" || c.status === "abandoned").slice(0, limit);
  result.checked = eligible.length;

  for (const cart of eligible) {
    const requiredMinutes = thresholds[cart.recoveryEmailCount];
    if (!requiredMinutes || requiredMinutes <= 0) {
      result.skipped++;
      continue;
    }
    const dueAt = new Date(cart.lastActivityAt.getTime() + requiredMinutes * 60_000);
    if (dueAt > now) {
      result.skipped++;
      continue;
    }

    // Regra 5: quem comprou por outro caminho com o mesmo e-mail (depois do carrinho) não recebe lembrete.
    const paidLater = cart.customerEmail
      ? await db.query.orders.findFirst({
          where: and(eq(orders.customerEmail, cart.customerEmail), eq(orders.paymentStatus, "paid"), gt(orders.createdAt, cart.createdAt)),
        })
      : null;
    if (paidLater) {
      result.skipped++;
      continue;
    }

    // Regra 6: carrinho com Pix pendente já é coberto pelo lembrete de Pix (sendPendingPixReminders).
    if (cart.orderId) {
      const order = await db.query.orders.findFirst({ where: eq(orders.id, cart.orderId) });
      if (order && order.paymentMethod === "pix" && order.paymentStatus === "pending") {
        result.skipped++;
        continue;
      }
    }

    const templateKey: CartTemplateKey = cart.recoveryEmailCount === 0 ? "cart_abandoned_1" : cart.recoveryEmailCount === 1 ? "cart_abandoned_2" : "cart_abandoned_3";

    try {
      const mail = await sendCartEmail(cart, templateKey, { automatic: true, triggeredBy: "cron" });
      if (mail.ok) {
        const nowSent = new Date();
        const updated = await db
          .update(checkoutCarts)
          .set({
            recoveryEmailCount: cart.recoveryEmailCount + 1,
            lastRecoveryEmailAt: nowSent,
            status: cart.recoveryEmailCount === 0 ? "abandoned" : cart.status,
            updatedAt: nowSent,
          })
          .where(and(eq(checkoutCarts.id, cart.id), eq(checkoutCarts.recoveryEmailCount, cart.recoveryEmailCount)))
          .returning({ id: checkoutCarts.id });
        if (updated.length === 0) {
          // Outra execução já processou este carrinho nesse meio-tempo: e-mail já contabilizado lá.
          result.skipped++;
        } else {
          result.sent++;
        }
      } else if (mail.skipped) {
        result.skipped++;
      } else {
        result.errors++;
        log.error("e-mail de carrinho abandonado falhou", { cartId: cart.id, error: mail.error });
      }
    } catch (err) {
      result.errors++;
      log.error("cron de carrinho abandonado falhou", { cartId: cart.id, error: errorMessage(err) });
    }
  }

  return result;
}

/**
 * Segunda função do mesmo cron (plano 10.3): Pix expirado e cartão recusado sem nova tentativa,
 * ambos só para pedidos do checkout próprio. No máximo um e-mail de cada tipo por pedido
 * (controlado pelo `email_log`).
 */
export async function runPaymentFollowUps(limit = 50): Promise<AbandonedRunResult> {
  const result: AbandonedRunResult = { disabled: false, checked: 0, sent: 0, skipped: 0, errors: 0 };
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 60_000);

  const pixRows = await db.query.orders.findMany({
    where: and(
      eq(orders.checkoutProvider, OWN_PROVIDER),
      eq(orders.paymentStatus, "pending"),
      eq(orders.paymentMethod, "pix"),
      isNotNull(orders.pixExpiresAt),
      lt(orders.pixExpiresAt, cutoff),
    ),
    limit,
  });

  for (const order of pixRows) {
    result.checked++;
    try {
      const already = await db.query.emailLog.findFirst({ where: and(eq(emailLog.orderId, order.id), eq(emailLog.templateKey, "pix_expired")) });
      if (already) {
        result.skipped++;
        continue;
      }
      const mail = await sendOrderEmail(order, "pix_expired", { automatic: true, triggeredBy: "cron" });
      if (mail.ok) result.sent++;
      else if (mail.skipped) result.skipped++;
      else {
        result.errors++;
        log.error("e-mail de Pix expirado falhou", { orderId: order.id, error: mail.error });
      }
    } catch (err) {
      result.errors++;
      log.error("cron de Pix expirado falhou", { orderId: order.id, error: errorMessage(err) });
    }
  }

  const refusedAttempts = await db.query.paymentAttempts.findMany({
    where: and(eq(paymentAttempts.status, "refused"), lt(paymentAttempts.createdAt, cutoff)),
    orderBy: desc(paymentAttempts.createdAt),
    limit: limit * 3,
  });

  const seen = new Set<string>();
  let processed = 0;
  for (const attempt of refusedAttempts) {
    if (processed >= limit) break;
    if (seen.has(attempt.orderId)) continue;
    seen.add(attempt.orderId);

    const order = await db.query.orders.findFirst({ where: eq(orders.id, attempt.orderId) });
    if (!order || order.checkoutProvider !== OWN_PROVIDER || order.paymentStatus !== "pending") continue;

    // Confirma que a tentativa recusada é mesmo a ÚLTIMA do pedido (uma tentativa mais nova pode ter aprovado).
    const lastAttempt = await db.query.paymentAttempts.findFirst({
      where: eq(paymentAttempts.orderId, order.id),
      orderBy: desc(paymentAttempts.createdAt),
    });
    if (!lastAttempt || lastAttempt.status !== "refused" || lastAttempt.createdAt >= cutoff) continue;

    processed++;
    result.checked++;
    try {
      const already = await db.query.emailLog.findFirst({ where: and(eq(emailLog.orderId, order.id), eq(emailLog.templateKey, "payment_refused")) });
      if (already) {
        result.skipped++;
        continue;
      }
      const mail = await sendOrderEmail(order, "payment_refused", { automatic: true, triggeredBy: "cron" });
      if (mail.ok) result.sent++;
      else if (mail.skipped) result.skipped++;
      else {
        result.errors++;
        log.error("e-mail de pagamento recusado falhou", { orderId: order.id, error: mail.error });
      }
    } catch (err) {
      result.errors++;
      log.error("cron de pagamento recusado falhou", { orderId: order.id, error: errorMessage(err) });
    }
  }

  return result;
}
