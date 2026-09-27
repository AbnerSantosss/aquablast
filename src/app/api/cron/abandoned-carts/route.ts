import { ensureBootstrap } from "@/lib/bootstrap";
import { runAbandonedCarts, runPaymentFollowUps } from "@/lib/email/abandoned";
import { errorMessage, log } from "@/lib/log";
import { cronAuthorized, unauthorized } from "../auth";

/**
 * GET /api/cron/abandoned-carts — envia lembretes de carrinho abandonado (até 50 por rodada) e os
 * e-mails de pós-pagamento do checkout próprio (Pix expirado, cartão recusado sem nova tentativa).
 * A cadência por carrinho/pedido é controlada por `checkout.recovery.*` no painel e pelo `email_log`;
 * chamar com frequência não gera envios duplicados.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) return unauthorized();
  const started = Date.now();
  try {
    await ensureBootstrap();
    const carts = await runAbandonedCarts(50);
    const followUps = await runPaymentFollowUps(50);
    const durationMs = Date.now() - started;
    log.info("cron abandoned-carts", { carts, followUps, durationMs });
    return Response.json({ ok: true, carts, followUps, durationMs });
  } catch (err) {
    const message = errorMessage(err);
    log.error("cron abandoned-carts falhou", { error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
