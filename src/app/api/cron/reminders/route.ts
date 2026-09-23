import { ensureBootstrap } from "@/lib/bootstrap";
import { sendPendingPixReminders } from "@/lib/email/reminders";
import { errorMessage, log } from "@/lib/log";
import { cronAuthorized, unauthorized } from "../auth";

/**
 * GET /api/cron/reminders — envia lembretes de Pix pendente (até 50 por rodada).
 * A cadência por pedido é controlada por `email.pixReminder.afterMinutes` / `maxCount`
 * no painel; chamar com frequência não gera envios duplicados.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) return unauthorized();
  const started = Date.now();
  try {
    await ensureBootstrap();
    const result = await sendPendingPixReminders(50);
    const durationMs = Date.now() - started;
    log.info("cron reminders", { ...result, errors: result.errors.length, durationMs });
    return Response.json({ ok: true, ...result, durationMs });
  } catch (err) {
    const message = errorMessage(err);
    log.error("cron reminders falhou", { error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
