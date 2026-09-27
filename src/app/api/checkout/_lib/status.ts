import { ensureBootstrap } from "@/lib/bootstrap";
import { getOrderByPublicToken } from "@/lib/checkout/own/order";
import { getGateway, isGatewayName } from "@/lib/gateways";
import { errorMessage, log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { fail, json, tooMany } from "./http";
import { latestAttempt, publicPaymentState, syncAttempt } from "./sync";

/**
 * GET /api/checkout/status/<publicToken> (plano 7.3). Também atende `?t=<publicToken>` em /api/checkout/status.
 * - Rate limit 30/min por IP.
 * - Se a última tentativa está `pending` e tem id no gateway, consulta `gw.fetchStatus` no máximo 1 vez
 *   a cada 10 s por tentativa e aplica (mesma regra do postback).
 * - Responde só `{ ok, status, orderNumber }`. Nada de dados pessoais.
 */
export async function checkoutStatus(request: Request, token: string | null): Promise<Response> {
  await ensureBootstrap();
  const limit = await rateLimit(`ck:status:${clientIp(request.headers)}`, 30, 60);
  if (!limit.allowed) return tooMany(limit.retryAfterSeconds);

  if (!token || token.length < 10 || token.length > 80) return fail(404, "Pedido não encontrado.");
  let order = await getOrderByPublicToken(token);
  if (!order) return fail(404, "Pedido não encontrado.");

  let last = await latestAttempt(order.id);
  const pending = last;
  if (order.paymentStatus === "pending" && pending?.status === "pending" && pending.providerTransactionId && isGatewayName(pending.provider)) {
    const gate = await rateLimit(`ck:fetch:${pending.id}`, 1, 10);
    if (gate.allowed) {
      try {
        const st = await getGateway(pending.provider).fetchStatus(pending.providerTransactionId);
        const out = await syncAttempt(pending, st, "system");
        if (out.order) order = out.order;
        last = await latestAttempt(order.id);
      } catch (err) {
        log.warn("checkout status: consulta ao gateway falhou", { attemptId: pending.id, gateway: pending.provider, error: errorMessage(err).slice(0, 200) });
      }
    }
  }

  return json({ ok: true, status: publicPaymentState(order, last), orderNumber: order.orderNumber });
}
