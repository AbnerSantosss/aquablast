import { after } from "next/server";
import { ensureBootstrap } from "@/lib/bootstrap";
import { upsertCart } from "@/lib/checkout/own/cart";
import { validCPF, validMobile } from "@/lib/checkout/own/masks";
import { notifyCheckoutEvent } from "@/lib/email/checkout-alerts";
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
 * Rastreamento 100% no servidor: InitiateCheckout quando o carrinho nasce (`ic-<visit>`, o mesmo id que
 * /api/checkout/opened já mandou ao abrir a página, então a reserva em conversion_events não envia de novo; sem
 * `visit`, `ic-<token>`) e
 * AddPaymentInfo (`api-<token>`, 1 por carrinho) assim que o carrinho tem e-mail ou celular — o salvamento parcial
 * (`lead`, blur dos campos) já basta, mesmo que a pessoa abandone; ambos depois da resposta (`after`).
 * Aviso por e-mail à equipe (checkout-alerts): "chegou no pagamento", uma vez por carrinho. O "checkout aberto"
 * saiu daqui em 2026-09-30 e foi para POST /api/checkout/opened (dispara ao abrir a página, antes do e-mail).
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
    if (input.customer.cpf !== undefined && !validCPF(input.customer.cpf)) return fail(400, "CPF inválido.", { field: "customer.cpf" });
    if (!validMobile(input.customer.phone)) return fail(400, "Celular inválido. Use DDD + número com 9 dígitos.", { field: "customer.phone" });
  }
  if (input.lead?.phone !== undefined && !validMobile(input.lead.phone)) return fail(400, "Celular inválido. Use DDD + número com 9 dígitos.", { field: "lead.phone" });

  const s = await getSettings(["checkout.bumpEnabled", "checkout.maxInstallments"] as const);
  if (!s["checkout.bumpEnabled"]) input.bump = false;

  try {
    const { cart, created } = await upsertCart(input, request.headers);
    const quote = await quoteBoth(input.selection.pack, input.bump, Math.max(1, s["checkout.maxInstallments"]), input.coupon);

    const reachedPayment = input.step === "pagamento";
    // AddPaymentInfo = "deixou contato": basta e-mail ou celular gravado (pedido do dono 2026-09-30), mesmo que abandone.
    const leftContact = reachedPayment || (!!(input.customer || input.lead) && !!(cart.customerEmail || cart.customerPhone));
    if (created || leftContact) {
      after(async () => {
        try {
          if (created) await trackServerEvent({ name: "InitiateCheckout", eventId: `ic-${input.visit ?? cart.token}`, cart });
          if (leftContact) await trackServerEvent({ name: "AddPaymentInfo", eventId: `api-${cart.token}`, cart });
        } catch (err) {
          log.error("checkout cart: falha no rastreamento", { cartId: cart.id, error: errorMessage(err) });
        }
        if (reachedPayment) await notifyCheckoutEvent({ event: "pagamento", cart });
      });
    }

    // `quote` é o nome do plano (7.1); `quotes` é o nome do contrato entre agentes na wiki. Mesmo objeto.
    return json({ ok: true, token: cart.token, created, quote, quotes: quote });
  } catch (err) {
    log.error("checkout cart: falha ao salvar", { error: errorMessage(err) });
    return fail(500, "Não conseguimos salvar seus dados agora. Tente de novo em instantes.");
  }
}
