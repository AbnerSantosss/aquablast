"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { checkoutCarts } from "@/db/schema";
import { getCartById } from "@/lib/checkout/own/cart";
import { sendCartEmail, type CartTemplateKey } from "@/lib/email/abandoned";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { actorOf, audit } from "@/lib/admin/audit";
import { uuid } from "@/lib/admin/form";
import { fail, ok, type ActionResult } from "@/lib/admin/types";

/**
 * "Enviar lembrete agora" (Fase 11.5): dispara o próximo e-mail da sequência de recuperação
 * (cart_abandoned_1/2/3, conforme quantos já foram enviados) manualmente, fora do cron.
 */
export async function sendReminderNow(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  await ensureBootstrap();
  const actor = actorOf(session);

  const cartId = uuid(formData, "cartId");
  const cart = cartId ? await getCartById(cartId) : null;
  if (!cart) return fail("Carrinho não encontrado.");
  if (!cart.customerEmail) return fail("Este carrinho não tem e-mail do cliente.");
  if (cart.status === "converted" || cart.status === "recovered") return fail("Este carrinho já virou pedido pago.");
  if (cart.unsubscribedAt) return fail("O cliente pediu para não receber mais e-mails deste carrinho.");
  if (cart.recoveryEmailCount >= 3) return fail("Os 3 lembretes já foram enviados para este carrinho.");

  const templateKey: CartTemplateKey = cart.recoveryEmailCount === 0 ? "cart_abandoned_1" : cart.recoveryEmailCount === 1 ? "cart_abandoned_2" : "cart_abandoned_3";
  const r = await sendCartEmail(cart, templateKey, { automatic: false, triggeredBy: actor });
  if (!r.ok) return fail(r.error ?? r.skipped ?? "Falha ao enviar o lembrete.");

  const now = new Date();
  await db
    .update(checkoutCarts)
    .set({
      recoveryEmailCount: cart.recoveryEmailCount + 1,
      lastRecoveryEmailAt: now,
      status: cart.recoveryEmailCount === 0 && cart.status === "open" ? "abandoned" : cart.status,
      updatedAt: now,
    })
    .where(eq(checkoutCarts.id, cart.id));

  await audit(actor, "cart.reminder.manual", { type: "checkout_cart", id: cart.id }, { templateKey });
  revalidatePath("/admin/carrinhos");
  return ok(`Lembrete enviado para ${cart.customerEmail}.`);
}
