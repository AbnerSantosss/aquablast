import { ensureBootstrap } from "@/lib/bootstrap";
import { errorMessage, log } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { syncAllActive } from "@/lib/tracking/sync";
import { retryFailedConversions } from "@/lib/tracking-ads/dispatch";
import { cronAuthorized, unauthorized } from "../auth";

/**
 * GET /api/cron/tracking-sync — consulta o provedor de rastreio para até 50 pedidos ativos.
 * Chamado pelo serviço `scheduler` do docker-compose a cada 15 min; respeita
 * `tracking.syncIntervalMinutes` (painel) usando a tabela rate_limits como trava
 * compartilhada entre réplicas. `?force=1` ignora o intervalo.
 * Antes da trava, reenvia os eventos de anúncio que ficaram em "error" por falha de rede (retryFailedConversions,
 * 2026-09-30): fica aqui para não precisar mexer no scheduler do docker-compose.
 */
export const dynamic = "force-dynamic";

const BATCH = 50;

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) return unauthorized();
  const started = Date.now();
  try {
    await ensureBootstrap();
    let ads: Awaited<ReturnType<typeof retryFailedConversions>> | { error: string };
    try {
      ads = await retryFailedConversions();
    } catch (err) {
      ads = { error: errorMessage(err) };
      log.error("cron tracking-sync: reenvio de eventos falhou", ads);
    }
    const force = new URL(request.url).searchParams.get("force") === "1";
    const intervalMinutes = Number(await getSetting("tracking.syncIntervalMinutes")) || 0;
    if (!force && intervalMinutes > 0) {
      const gate = await rateLimit("cron:tracking-sync", 1, intervalMinutes * 60);
      if (!gate.allowed) {
        return Response.json({ ok: true, skipped: true, reason: `última varredura há menos de ${intervalMinutes} min`, retryAfterSeconds: gate.retryAfterSeconds, ads });
      }
    }
    const counts = await syncAllActive(BATCH);
    const durationMs = Date.now() - started;
    log.info("cron tracking-sync", { ...counts, durationMs });
    return Response.json({ ok: true, ...counts, ads, durationMs });
  } catch (err) {
    const message = errorMessage(err);
    log.error("cron tracking-sync falhou", { error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
