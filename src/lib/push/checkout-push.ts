import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { pushAlerts } from "@/db/schema";
import type { CheckoutAlert } from "@/lib/email/checkout-alerts";
import { errorMessage, log } from "@/lib/log";
import { getSettings } from "@/lib/settings";
import { countSubscriptions, sendPush, type PushMessage } from "./send";

/**
 * Push do app do painel para os MESMOS eventos dos avisos por e-mail (ajuste do dono, 2026-09-30).
 * Chamado por notifyCheckoutEvent (lib/email/checkout-alerts.ts), em paralelo e independente do e-mail:
 * um sai mesmo se o outro falhar. Só roda se o evento está ligado em `alerts.events` (conferido lá) E em
 * `alerts.pushEvents`. Não repete: inicio/pagamento uma vez por carrinho, pago uma vez por pedido
 * (tabela push_alerts). Nunca dado de cartão além de bandeira/final/parcelas (já vem assim no resumo).
 */

/** Resumo já calculado pelo checkout-alerts (evita import circular e cálculo duplicado). */
export interface AlertSummary {
  product: string;
  /** "Pix", "Cartão Visa final 1234 em 3x"... vazio quando ainda não há forma de pagamento. */
  payment: string;
  /** Valor formatado (R$ 249,90) ou vazio. */
  value: string;
  /** "Cidade/UF" ou vazio. */
  city: string;
  /** Rótulo da tentativa no cartão: APROVADO, RECUSADO, EM ANÁLISE... */
  attemptLabel: string;
}

function titleOf(a: CheckoutAlert, s: AlertSummary): string {
  switch (a.event) {
    case "pago":
      return s.value ? `💰 Venda! ${s.value}` : "💰 Venda!";
    case "inicio":
      return "🛒 Checkout iniciado";
    case "pagamento":
      return "🧾 Chegou no pagamento";
    case "pix":
      return "⏳ Pix gerado";
    case "cartao":
      return `💳 Cartão ${s.attemptLabel || "tentativa"}`;
    case "falha":
      return "⚠️ Falha no pagamento";
  }
}

/** Monta o aviso (título, corpo curto, tag por carrinho/pedido + evento, link do painel). */
export function pushMessageFor(a: CheckoutAlert, s: AlertSummary): PushMessage {
  const parts: string[] = [];
  if (s.product && s.product !== "—") parts.push(s.product);
  if (a.event !== "pago" && s.value) parts.push(s.value);
  if (s.payment && s.payment !== "—") parts.push(s.payment);
  if (s.city) parts.push(s.city);
  if (a.event === "falha" && a.problem) parts.push(a.problem.slice(0, 80));
  if (a.event === "cartao" && a.attempt?.reason && a.attempt.status !== "paid") parts.push(a.attempt.reason.slice(0, 60));
  const ref = a.order?.id ?? a.cart?.id ?? randomUUID();
  return {
    title: titleOf(a, s),
    body: parts.join(" · ") || "Abra o painel para ver os detalhes.",
    tag: `${a.event}:${ref}`,
    url: a.order ? `/admin/pedidos/${a.order.id}` : "/admin/carrinhos",
    kind: a.event === "pago" ? "sale" : "event",
    event: a.event,
    orderId: a.order?.id ?? null,
  };
}

/** Chave do "não repetir": só inicio/pagamento (por carrinho) e pago (por pedido). */
function dedupeKeyOf(a: CheckoutAlert): string | null {
  if (a.event === "pago" && a.order) return `pago:${a.order.id}`;
  if ((a.event === "inicio" || a.event === "pagamento") && a.cart) return `${a.event}:${a.cart.id}`;
  return null;
}

/** O push deste evento está ligado em `alerts.pushEvents`? (o `alerts.events` é conferido por quem chama) */
export async function pushAlertEnabled(event: CheckoutAlert["event"]): Promise<boolean> {
  const s = await getSettings(["alerts.pushEvents"] as const);
  const list: readonly string[] = Array.isArray(s["alerts.pushEvents"]) ? s["alerts.pushEvents"] : [];
  return list.includes(event);
}

/** Manda o push do evento do checkout. Nunca lança. */
export async function pushCheckoutEvent(a: CheckoutAlert, summary: AlertSummary): Promise<void> {
  try {
    if (!(await pushAlertEnabled(a.event))) return;
    if ((await countSubscriptions()) === 0) return;

    const key = dedupeKeyOf(a);
    if (key) {
      const claimed = await db.insert(pushAlerts).values({ dedupeKey: key, event: a.event }).onConflictDoNothing().returning({ id: pushAlerts.id });
      if (!claimed.length) return; // já avisado
    }

    const result = await sendPush(pushMessageFor(a, summary));
    if (key) {
      if (result.sent === 0) {
        // Nenhum aparelho recebeu: solta a trava para uma próxima chamada tentar de novo.
        await db.delete(pushAlerts).where(eq(pushAlerts.dedupeKey, key));
      } else {
        await db.update(pushAlerts).set({ sentCount: result.sent }).where(eq(pushAlerts.dedupeKey, key));
      }
    }
  } catch (err) {
    log.error("push do checkout: falha", { event: a.event, error: errorMessage(err) });
  }
}
