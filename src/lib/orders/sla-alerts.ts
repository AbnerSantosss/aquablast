import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { formatDateTime } from "@/lib/admin/format";
import { pendingShipmentWhere, shipmentPaidAt, shipmentPaidDate } from "@/lib/admin/queries";
import { adminAlertEnabled, adminAlertRecipient } from "@/lib/email/checkout-alerts";
import { sendAdminSlaAlert } from "@/lib/email/send";
import { errorMessage, log } from "@/lib/log";
import { getSettings } from "@/lib/settings";
import { slaLateCutoff, slaState } from "./sla";

export interface SlaAlertRunResult {
  /** Sem destinatário (painel e ADMIN_EMAIL vazios) ou aviso "atraso" desligado: nada é enviado nem marcado. */
  disabled: boolean;
  candidates: number;
  sent: number;
  failed: number;
  errors: string[];
}

/**
 * Alerta de prazo de postagem: para cada pedido pago, sem rastreio e com o prazo (`orders.slaDays`)
 * vencido, manda UM e-mail para a equipe (`alerts.adminEmail`; vazio = ADMIN_EMAIL do ambiente, desde
 * 2026-09-30) e grava `sla_alerted_at`, então a próxima rodada do cron não repete. Sem destinatário ou com o
 * aviso "atraso" desligado em Configurações > Envios não grava nada: ao religar, os atrasados avisam.
 * Falha de envio também não grava (tenta de novo na próxima rodada).
 */
export async function checkSlaAlerts(limit = 50): Promise<SlaAlertRunResult> {
  const result: SlaAlertRunResult = { disabled: false, candidates: 0, sent: 0, failed: 0, errors: [] };
  const s = await getSettings(["orders.slaDays"] as const);
  const to = await adminAlertRecipient();
  if (!to || !(await adminAlertEnabled("atraso"))) return { ...result, disabled: true };
  const slaDays = Number(s["orders.slaDays"]) || 3;

  const now = new Date();
  const rows = await db.query.orders.findMany({
    where: and(pendingShipmentWhere(), lt(shipmentPaidDate(), slaLateCutoff(slaDays, now)), isNull(orders.slaAlertedAt)),
    orderBy: shipmentPaidDate(),
    limit,
  });
  result.candidates = rows.length;

  for (const order of rows) {
    const paidAt = shipmentPaidAt(order);
    const state = slaState(paidAt, slaDays, now);
    try {
      const mail = await sendAdminSlaAlert(order, to, { paidAt, daysLate: Math.max(1, -state.daysLeft), slaDays, paidAtLabel: formatDateTime(paidAt) });
      if (mail.ok) {
        await db.update(orders).set({ slaAlertedAt: new Date() }).where(eq(orders.id, order.id));
        result.sent += 1;
      } else {
        result.failed += 1;
        result.errors.push(`${order.orderNumber}: ${mail.error ?? mail.skipped}`);
      }
    } catch (err) {
      result.failed += 1;
      result.errors.push(`${order.orderNumber}: ${errorMessage(err)}`);
    }
  }
  if (result.failed > 0) log.warn("alerta de prazo de postagem com falhas", { failed: result.failed, errors: result.errors.slice(0, 5) });
  return result;
}
