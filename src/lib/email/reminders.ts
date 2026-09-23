import { and, eq, gt, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { errorMessage, log } from "@/lib/log";
import { getOrderById, updateOrderFields } from "@/lib/orders/service";
import { getSettings } from "@/lib/settings";
import { sendOrderEmail } from "./send";
import { getTemplate } from "./templates";

export interface ReminderRunResult {
  /** Lembrete desligado (afterMinutes = 0, maxCount = 0 ou template pix_reminder desativado). */
  disabled: boolean;
  /** Pedidos que se encaixaram na regra nesta rodada. */
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

/**
 * Envia o lembrete automático de Pix pendente (template `pix_reminder`).
 *
 * Regras (todas precisam valer):
 * - pagamento `pending`, `pixCode` preenchido, pedido não cancelado;
 * - criado há mais de `email.pixReminder.afterMinutes` (0 = desligado);
 * - `reminderCount` < `email.pixReminder.maxCount`;
 * - último lembrete nulo ou mais antigo que `afterMinutes`;
 * - Pix sem expiração ou ainda válido.
 *
 * Em sucesso incrementa `reminderCount` e grava `lastReminderAt`. Em falha de envio
 * grava só `lastReminderAt` (espera a janela de novo, sem consumir uma tentativa).
 */
export async function sendPendingPixReminders(limit = 50): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { disabled: false, candidates: 0, sent: 0, failed: 0, skipped: 0, errors: [] };
  const s = await getSettings(["email.pixReminder.afterMinutes", "email.pixReminder.maxCount"] as const);
  const afterMinutes = Number(s["email.pixReminder.afterMinutes"]) || 0;
  const maxCount = Number(s["email.pixReminder.maxCount"]) || 0;
  if (afterMinutes <= 0 || maxCount <= 0) return { ...result, disabled: true };

  const template = await getTemplate("pix_reminder");
  if (!template.enabled) return { ...result, disabled: true };

  const now = new Date();
  const cutoff = new Date(now.getTime() - afterMinutes * 60_000);
  const rows = await db.query.orders.findMany({
    where: and(
      eq(orders.paymentStatus, "pending"),
      isNotNull(orders.pixCode),
      ne(orders.status, "cancelled"),
      lt(orders.createdAt, cutoff),
      lt(orders.reminderCount, maxCount),
      or(isNull(orders.lastReminderAt), lt(orders.lastReminderAt, cutoff)),
      or(isNull(orders.pixExpiresAt), gt(orders.pixExpiresAt, now)),
    ),
    orderBy: orders.createdAt,
    limit,
  });
  result.candidates = rows.length;

  for (const order of rows) {
    try {
      const mail = await sendOrderEmail(order, "pix_reminder", { automatic: true, triggeredBy: "cron" });
      if (mail.ok) {
        // Relê a contagem antes de incrementar: outro processo pode ter enviado nesse meio-tempo.
        const current = await getOrderById(order.id);
        const count = current?.reminderCount ?? order.reminderCount;
        await updateOrderFields(order.id, { reminderCount: count + 1, lastReminderAt: new Date() });
        result.sent++;
      } else if (mail.skipped) {
        result.skipped++;
      } else {
        result.failed++;
        result.errors.push(`${order.orderNumber}: ${mail.error ?? "erro desconhecido"}`);
        await updateOrderFields(order.id, { lastReminderAt: new Date() });
      }
    } catch (err) {
      result.failed++;
      const message = errorMessage(err);
      result.errors.push(`${order.orderNumber}: ${message}`);
      log.error("lembrete de Pix falhou", { orderId: order.id, error: message });
    }
  }
  return result;
}
