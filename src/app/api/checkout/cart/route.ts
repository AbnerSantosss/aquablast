import { after } from "next/server";
import { ensureBootstrap } from "@/lib/bootstrap";
import { upsertCart } from "@/lib/checkout/own/cart";
import { validCPF, validMobile } from "@/lib/checkout/own/masks";
import { quoteBoth } from "@/lib/checkout/own/pricing";
import { cartSchema, describeInputError } from "@/lib/checkout/own/schemas";
import { errorMessage, log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { trackServerEvent } from "@/lib/tracking-ads/dispatch";
import { fail, json, originAllowed, readJson, tooMany } from "../_lib/http";

/**
 * POST /api/checkout/cart (plano 7.1) — cria/atualiza o carrinho a cada etapa do checkout.
 * O navegador manda seleção, etapa, dados, endereço e os ids de anúncio lidos no navegador; nunca valor.
 * Rastreamento 100% no servidor: InitiateCheckout (`ic-<token>`) quando o carrinho nasce e
 * AddPaymentInfo (`api-<token>`) quando chega na etapa de pagamento, ambos depois da resposta (`after`).
 * O upsertCart grava IP e user-agent da requisição e só guarda ids de anúncio com consentimento.
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  await ensureBootstrap();

  const limit = await rateLimit(`ck:cart:${clientIp(request.headers)}`, 60, 60);
  if (!limit.allowed) return tooMany(limit.retryAfterSeconds);

  const body = await readJson(request, MAX_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsed = cartSchema.safeParse(body.data);
  if (!parsed.success) {
    const { field, message } = describeInputError(parsed.error);
    return fail(400, message, { field });
  }
  const input = parsed.data;

  if (input.customer) {
    if (!validCPF(input.customer.cpf)) return fail(400, "CPF inválido.", { field: "customer.cpf" });
    if (!validMobile(input.customer.phone)) return fail(400, "Celular inválido. Use DDD + número com 9 dígitos.", { field: "customer.phone" });
  }

  const s = await getSettings(["checkout.bumpEnabled", "checkout.maxInstallments"] as const);
  if (!s["checkout.bumpEnabled"]) input.bump = false;

  try {
    const { cart, created } = await upsertCart(input, request.headers);
    const quote = await quoteBoth(input.selection.pack, input.bump, Math.max(1, s["checkout.maxInstallments"]));

    const reachedPayment = input.step === "pagamento";
    if (created || reachedPayment) {
      after(async () => {
        try {
          if (created) await trackServerEvent({ name: "InitiateCheckout", eventId: `ic-${cart.token}`, cart });
          if (reachedPayment) await trackServerEvent({ name: "AddPaymentInfo", eventId: `api-${cart.token}`, cart });
        } catch (err) {
          log.error("checkout cart: falha no rastreamento", { cartId: cart.id, error: errorMessage(err) });
        }
      });
    }

    return json({ ok: true, token: cart.token, created, quote });
  } catch (err) {
    log.error("checkout cart: falha ao salvar", { error: errorMessage(err) });
    return fail(500, "Não conseguimos salvar seus dados agora. Tente de novo em instantes.");
  }
}
