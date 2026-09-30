import { ensureBootstrap } from "@/lib/bootstrap";
import { sendPendingPixReminders } from "@/lib/email/reminders";
import { errorMessage, log } from "@/lib/log";
import { checkSlaAlerts, type SlaAlertRunResult } from "@/lib/orders/sla-alerts";
import { cronAuthorized, unauthorized } from "../auth";

/**
 * GET /api/cron/reminders — envia lembretes de Pix pendente (até 50 por rodada).
 * A cadência por pedido é controlada por `email.pixReminder.afterMinutes` / `maxCount`
 * no painel; chamar com frequência não gera envios duplicados.
 *
 * Na mesma rodada roda o alerta de prazo de postagem (`checkSlaAlerts`): um e-mail por pedido pago sem
 * rastreio que passou de `orders.slaDays`, para `alerts.adminEmail`. Vai no campo `sla` da resposta.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) return unauthorized();
  const started = Date.now();
  try {
    await ensureBootstrap();
    const result = await sendPendingPixReminders(50);
    // Falha no alerta de prazo não pode derrubar o lembrete de Pix (e vice-versa): erro vai no campo `sla`.
    let sla: SlaAlertRunResult | { error: string };
    try {
      sla = await checkSlaAlerts(50);
    } catch (err) {
      sla = { error: errorMessage(err) };
      log.error("cron reminders: alerta de prazo falhou", { error: sla.error });
    }
    const durationMs = Date.now() - started;
    log.info("cron reminders", { ...result, errors: result.errors.length, sla: "error" in sla ? sla.error : { sent: sla.sent, failed: sla.failed, disabled: sla.disabled }, durationMs });
    return Response.json({ ok: true, ...result, sla, durationMs });
  } catch (err) {
    const message = errorMessage(err);
    log.error("cron reminders falhou", { error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
