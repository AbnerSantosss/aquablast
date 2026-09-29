import { z } from "zod";
import { ensureBootstrap } from "@/lib/bootstrap";
import { normalizeCoupon, quoteBoth } from "@/lib/checkout/own/pricing";
import { getSettings } from "@/lib/settings";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { fail, json, originAllowed, readJson, tooMany } from "../_lib/http";

const inputSchema = z.object({
  pack: z.enum(["unit", "kit"]),
  bump: z.boolean(),
  coupon: z.string().trim().max(40),
});

/** Cotação sem criar carrinho, iniciar pagamento ou disparar rastreamento. */
export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  try {
    await ensureBootstrap();
    const limit = await rateLimit(`ck:quote:${clientIp(request.headers)}`, 30, 60);
    if (!limit.allowed) return tooMany(limit.retryAfterSeconds);
    const body = await readJson(request, 1024);
    if (!body.ok) return body.response;
    const parsed = inputSchema.safeParse(body.data);
    if (!parsed.success) return fail(400, "Confira o código do cupom e tente novamente.");
    const { pack, bump, coupon } = parsed.data;
    const settings = await getSettings(["checkout.maxInstallments", "checkout.bumpEnabled"] as const);
    const code = normalizeCoupon(coupon);
    const quotes = await quoteBoth(pack, bump && settings["checkout.bumpEnabled"], Math.max(1, settings["checkout.maxInstallments"]), code);
    if (code && quotes.pix.couponDiscountCents <= 0) return fail(422, "Este cupom não está disponível para esta compra.");
    return json({ ok: true, quotes });
  } catch {
    return fail(500, "Não foi possível validar o cupom. Tente novamente.");
  }
}
