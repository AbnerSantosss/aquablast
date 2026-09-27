import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { paymentAttempts } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { getOrderByPublicToken } from "@/lib/checkout/own/order";
import { isProd } from "@/lib/env";
import { simuladoGateway, simulatePixPaid } from "@/lib/gateways/simulado";
import { errorMessage, log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { fail, json, originAllowed, readJson, tooMany } from "../_lib/http";
import { publicPaymentState, syncAttempt } from "../_lib/sync";

/**
 * POST /api/checkout/simular-pagamento (plano 7.6) — só para o gateway `simulado` (testes).
 * Corpo `{ publicToken }`. Em produção com `checkout.mode === "proprio"` responde 404.
 * Marca o Pix simulado pendente como pago e roda o MESMO fluxo do postback:
 * fetchStatus → applyPaymentStatus → markCartConverted + Purchase.
 */
export const dynamic = "force-dynamic";

const bodySchema = z.strictObject({ publicToken: z.string().min(10).max(80) });
const notFound = () => fail(404, "Não encontrado.");

export async function POST(request: Request): Promise<Response> {
  await ensureBootstrap();
  if (isProd() && (await getSetting("checkout.mode")) === "proprio") return notFound();
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");

  const limit = await rateLimit(`ck:simular:${clientIp(request.headers)}`, 20, 60);
  if (!limit.allowed) return tooMany(limit.retryAfterSeconds);

  const body = await readJson(request, 2 * 1024);
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) return fail(400, "Informe o publicToken do pedido.", { field: "publicToken" });

  const order = await getOrderByPublicToken(parsed.data.publicToken);
  if (!order) return notFound();

  const attempt = await db.query.paymentAttempts.findFirst({
    where: and(eq(paymentAttempts.orderId, order.id), eq(paymentAttempts.provider, "simulado"), eq(paymentAttempts.status, "pending"), isNotNull(paymentAttempts.providerTransactionId)),
    orderBy: desc(paymentAttempts.createdAt),
  });
  if (!attempt?.providerTransactionId) return fail(409, "Nenhum pagamento simulado pendente neste pedido.");

  try {
    const ok = await simulatePixPaid(attempt.providerTransactionId);
    if (!ok) return notFound();
    const st = await simuladoGateway.fetchStatus(attempt.providerTransactionId);
    const out = await syncAttempt(attempt, st, "system");
    const final = out.order ?? order;
    return json({ ok: true, status: publicPaymentState(final, null), orderNumber: final.orderNumber });
  } catch (err) {
    log.error("checkout simular-pagamento: falha", { orderId: order.id, error: errorMessage(err) });
    return fail(500, "Falha ao simular o pagamento.");
  }
}
