import { after } from "next/server";
import { z } from "zod";
import { ensureBootstrap } from "@/lib/bootstrap";
import { quote } from "@/lib/checkout/own/pricing";
import { selectionSchema } from "@/lib/checkout/own/schemas";
import { notifyCheckoutEvent } from "@/lib/email/checkout-alerts";
import { errorMessage, log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordCheckoutOpen } from "@/lib/tracking-ads/page-events";
import { visitorId } from "@/lib/tracking-ads/visitor";
import { fail, json, originAllowed, readJson, tooMany } from "../_lib/http";

/**
 * POST /api/checkout/opened — "alguém abriu o checkout" (pedido do dono, 2026-09-30: "não chegou aviso por
 * email quando o cliente inicia o checkout"). Antes o aviso `inicio` só saía quando o carrinho nascia, e o
 * carrinho só nasce quando o cliente digita o e-mail: quem abria e desistia antes não gerava aviso nenhum.
 *
 * O navegador manda um id de visita (sessionStorage), a seleção e a origem (utm). Nada de dado pessoal.
 * Não repete: 1 aviso por visita a cada 6 h e no máximo 6 por IP por hora (o e-mail da equipe não vira spam
 * se alguém ficar recarregando). Sempre responde `{ ok:true }`: o aviso é detalhe interno, não erro do cliente.
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024;

const openedSchema = z.object({
  visit: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  selection: selectionSchema,
  coupon: z.string().max(40).optional(),
  source: z.string().max(80).optional(),
  campaign: z.string().max(120).optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  await ensureBootstrap();

  const ip = clientIp(request.headers);
  const limit = await rateLimit(`ck:open:${ip}`, 30, 60);
  if (!limit.allowed) return tooMany(limit.retryAfterSeconds);

  const body = await readJson(request, MAX_BODY_BYTES);
  if (!body.ok) return body.response;
  const parsed = openedSchema.safeParse(body.data);
  if (!parsed.success) return fail(400, "Requisição inválida.");
  const input = parsed.data;

  // Funil do dashboard ("abriram o checkout"): antes do limite de avisos, que é só para o e-mail/push.
  try {
    await recordCheckoutOpen(input.visit, await visitorId(), input.source);
  } catch (err) {
    log.warn("checkout aberto: visita não gravada", { error: errorMessage(err) });
  }

  const perVisit = await rateLimit(`ck:open:v:${input.visit}`, 1, 6 * 3600);
  if (!perVisit.allowed) return json({ ok: true });
  const perIp = await rateLimit(`ck:open:alert:${ip}`, 6, 3600);
  if (!perIp.allowed) return json({ ok: true });

  after(async () => {
    let amountCents: number | null = null;
    try {
      amountCents = (await quote(input.selection.pack, "pix", false, 1, input.coupon)).amountCents;
    } catch (err) {
      log.warn("checkout aberto: preço não calculado", { error: errorMessage(err) });
    }
    const origin = [input.source, input.campaign].map((v) => v?.replace(/[\u0000-\u001f\u007f<>]/g, "").trim()).filter(Boolean).join(" · ");
    await notifyCheckoutEvent({ event: "inicio", visit: { selection: input.selection, amountCents, origin } });
  });
  return json({ ok: true });
}
