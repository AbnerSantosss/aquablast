import { ensureBootstrap } from "@/lib/bootstrap";
import { errorMessage, log } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { syncAllActive } from "@/lib/tracking/sync";
import { cronAuthorized, unauthorized } from "../auth";

/**
 * GET /api/cron/tracking-sync — consulta o provedor de rastreio para até 50 pedidos ativos.
 * Chamado pelo serviço `scheduler` do docker-compose a cada 15 min; respeita
 * `tracking.syncIntervalMinutes` (painel) usando a tabela rate_limits como trava
 * compartilhada entre réplicas. `?force=1` ignora o intervalo.
 */
export const dynamic = "force-dynamic";

const BATCH = 50;

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) return unauthorized();
  const started = Date.now();
  try {
    await ensureBootstrap();
    const force = new URL(request.url).searchParams.get("force") === "1";
    const intervalMinutes = Number(await getSetting("tracking.syncIntervalMinutes")) || 0;
    if (!force && intervalMinutes > 0) {
      const gate = await rateLimit("cron:tracking-sync", 1, intervalMinutes * 60);
      if (!gate.allowed) {
        return Response.json({ ok: true, skipped: true, reason: `última varredura há menos de ${intervalMinutes} min`, retryAfterSeconds: gate.retryAfterSeconds });
      }
    }
    const counts = await syncAllActive(BATCH);
    const durationMs = Date.now() - started;
    log.info("cron tracking-sync", { ...counts, durationMs });
    return Response.json({ ok: true, ...counts, durationMs });
  } catch (err) {
    const message = errorMessage(err);
    log.error("cron tracking-sync falhou", { error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
