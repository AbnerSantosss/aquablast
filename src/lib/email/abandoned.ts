// STUB: implementado por emails-abandono.
// SÓ SERVIDOR. E-mails de carrinho abandonado (plano 10.2/10.3).
// Implementação final:
//   - sendCartEmail: usa getTemplate/renderTemplate de ./templates com as chaves novas cart_abandoned_1|2|3
//     (emails-abandono adiciona essas chaves a TemplateKey e DEFAULT_TEMPLATES em ./templates.ts e migra emailTemplates),
//     link de retomada `${APP_URL}/checkout?cart=<cart.token>` e link de descadastro
//     `${APP_URL}/api/checkout/cart/unsubscribe?t=<cart.token>` (unsubscribeCart em @/lib/checkout/own/cart).
//     Incrementa recoveryEmailCount e lastRecoveryEmailAt. Nunca envia se unsubscribedAt, sem e-mail ou carrinho converted/recovered.
//   - runAbandonedCarts: carrinhos `open` sem atividade há checkout.recovery.firstAfterMinutes viram `abandoned` e recebem o 1º e-mail;
//     2º e 3º pelos intervalos secondAfterMinutes/thirdAfterMinutes; respeita checkout.recovery.enabled.
//   - runPaymentFollowUps: pedidos do checkout próprio com Pix pendente/expirado → reusa pix_reminder de ./reminders ou template próprio.
// Cron: chamado pela mesma rota interna que roda os lembretes de Pix (o agente de API liga).
import type { CheckoutCart } from "@/db/schema";
import type { SendResult } from "./send";

export type CartTemplateKey = "cart_abandoned_1" | "cart_abandoned_2" | "cart_abandoned_3";

export interface AbandonedRunResult {
  /** Recuperação desligada no painel (checkout.recovery.enabled = false). */
  disabled: boolean;
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
}

export async function sendCartEmail(cart: CheckoutCart, templateKey: CartTemplateKey, opts: { automatic?: boolean; triggeredBy?: string } = {}): Promise<SendResult> {
  void cart;
  void opts;
  return { ok: false, skipped: `e-mail de carrinho (${templateKey}) ainda não implementado` }; // STUB: implementado por emails-abandono
}

export async function runAbandonedCarts(limit = 50): Promise<AbandonedRunResult> {
  void limit; // STUB: implementado por emails-abandono
  return { disabled: true, checked: 0, sent: 0, skipped: 0, errors: 0 };
}

export async function runPaymentFollowUps(limit = 50): Promise<AbandonedRunResult> {
  void limit; // STUB: implementado por emails-abandono
  return { disabled: true, checked: 0, sent: 0, skipped: 0, errors: 0 };
}
