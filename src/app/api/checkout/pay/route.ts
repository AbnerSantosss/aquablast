import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { checkoutCarts, paymentAttempts, type CheckoutCart, type Order } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { getCartByToken } from "@/lib/checkout/own/cart";
import { selectionFromCart, skuOf, titleOf } from "@/lib/checkout/own/catalog";
import { cardBrandOf, cardLast4, onlyDigits, validCardExpiry, validCPF, validLuhn } from "@/lib/checkout/own/masks";
import { createOrderFromCart, effectiveSelection } from "@/lib/checkout/own/order";
import { quote, type Quote } from "@/lib/checkout/own/pricing";
import { describeInputError, paySchema, type PayInput } from "@/lib/checkout/own/schemas";
import { decryptText } from "@/lib/crypto";
import { notifyCheckoutEvent, type CheckoutAlert } from "@/lib/email/checkout-alerts";
import { sendOrderEmail } from "@/lib/email/send";
import { isProd } from "@/lib/env";
import { gatewayFor, type ChargeInput, type ChargeResult, type Gateway } from "@/lib/gateways";
import { errorMessage, log } from "@/lib/log";
import { applyPaymentStatus } from "@/lib/orders/payment";
import { addOrderEvent, getOrderById, updateOrderFields } from "@/lib/orders/service";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { pixQrForScreen } from "@/lib/pix/qr";
import { getSettings } from "@/lib/settings";
import { appUrl, fail, json, originAllowed, readJson, tooMany } from "../_lib/http";
import { onOrderPaid, postbackUrlFor } from "../_lib/sync";

/**
 * POST /api/checkout/pay (plano 7.2 + travas da Fase 6).
 *
 * TRAVAS DO CARTÃO — leia antes de mexer:
 * - Número, validade e CVV existem SÓ na memória desta requisição. Nunca vão para banco, log, evento,
 *   e-mail, webhook_deliveries ou mensagem de erro. Em payment_attempts só `cardBrand` e `cardLast4`.
 * - Esta rota nunca devolve o corpo recebido nem o erro cru do gateway (só `result.message`, que o
 *   contrato define como texto seguro em pt-BR para o comprador).
 * - Gateway que tokeniza no navegador (Mercado Pago): exige `cardToken` e RECUSA `card` cru.
 *   Gateway que não tokeniza (IronPay, simulado...): exige `card` e valida Luhn, validade, CVV e CPF do titular.
 * - Rate limit: 10 por IP e 5 por carrinho a cada 10 minutos.
 * - O valor vem sempre de quote() no servidor. Cartão recusado NÃO cancela o pedido.
 * - Avisos à equipe por e-mail (checkout-alerts, depois da resposta): Pix gerado, cada tentativa no cartão
 *   (aprovada, em análise, recusada) e "falha" quando o gateway não cobrou ou a forma de pagamento está fora.
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
const WINDOW_SECONDS = 10 * 60;
const GENERIC_ERROR = "Não conseguimos processar o pagamento agora. Tente de novo em instantes.";
const REFUSED_DEFAULT = "Pagamento não autorizado. Confira os dados ou tente outro cartão ou o Pix.";

type PixOut = { code: string; qrUrl: string | null; expiresAt: string } | null;

function payResponse(status: number, body: { ok: boolean; status: string; orderNumber: string | null; publicToken: string | null; pix: PixOut; message: string | null; field?: string }): Response {
  // `error` repete `message` nas falhas para manter o mesmo formato das outras respostas de erro ({ ok:false, error }).
  return json(body.ok ? body : { ...body, error: body.message ?? GENERIC_ERROR }, status);
}

/** Tira sequências longas de dígitos de textos que vão para o log (defesa extra contra número de cartão). */
function scrub(text: string): string {
  return text.replace(/\d[\d .-]{10,}\d/g, "[removido]").slice(0, 300);
}

type CardCheck = { ok: true; brand: string | null; last4: string | null } | { ok: false; response: Response };

/** Regras do cartão por tipo de gateway. Nunca inclui os dados do cartão na resposta. */
function checkCard(input: PayInput, gw: Gateway): CardCheck {
  const bad = (message: string, field: string): CardCheck => ({ ok: false, response: fail(400, message, { field }) });
  if (input.method === "pix") {
    if (input.card || input.cardToken) return bad("Dados de cartão não são aceitos no pagamento por Pix.", "method");
    return { ok: true, brand: null, last4: null };
  }
  if (gw.tokenizesCard) {
    if (input.card) return bad("Por segurança, o número do cartão não pode ser enviado para este servidor. Recarregue a página e tente de novo.", "card");
    if (!input.cardToken) return bad("Não conseguimos validar o cartão. Confira os dados e tente de novo.", "cardToken");
    if (gw.name === "mercadopago" && !input.cardPaymentMethodId) return bad("Não conseguimos identificar a bandeira do cartão.", "cardPaymentMethodId");
    return { ok: true, brand: input.cardBrand ?? input.cardPaymentMethodId ?? null, last4: input.cardLast4 ?? null };
  }
  if (input.cardToken) return bad("Forma de envio do cartão não aceita. Recarregue a página e tente de novo.", "cardToken");
  const card = input.card;
  if (!card) return bad("Informe os dados do cartão.", "card");
  const number = onlyDigits(card.number);
  if (number.length < 13 || number.length > 19 || !validLuhn(number)) return bad("Número do cartão inválido.", "card.number");
  if (!validCardExpiry(card.expMonth, card.expYear)) return bad("Validade do cartão inválida ou vencida.", "card.expiry");
  if (!/^\d{3,4}$/.test(card.cvv)) return bad("Código de segurança (CVV) inválido.", "card.cvv");
  if (!validCPF(card.holderCpf)) return bad("CPF do titular do cartão inválido.", "card.holderCpf");
  return { ok: true, brand: cardBrandOf(number), last4: cardLast4(number) };
}

/** Aviso à equipe depois da resposta; notifyCheckoutEvent nunca lança. */
function alertTeam(a: CheckoutAlert): void {
  after(() => notifyCheckoutEvent(a));
}

function hasCustomerAndAddress(cart: CheckoutCart): boolean {
  return !!(
    cart.customerName &&
    cart.customerEmail &&
    cart.customerPhone &&
    cart.customerDocumentEnc &&
    cart.addressLine1 &&
    cart.addressNumber &&
    cart.addressNeighborhood &&
    cart.addressCity &&
    cart.addressState &&
    cart.addressPostalCode
  );
}

/** Pix ainda válido do mesmo pedido/valor/gateway: devolve o mesmo código em vez de cobrar de novo. */
async function reusablePix(cart: CheckoutCart, q: Quote, gw: Gateway): Promise<Order | null> {
  if (!cart.orderId) return null;
  const order = await getOrderById(cart.orderId);
  if (!order || order.paymentStatus !== "pending" || order.status === "cancelled") return null;
  if (order.paymentMethod !== "pix" || !order.pixCode || !order.pixExpiresAt) return null;
  if (order.pixExpiresAt.getTime() - Date.now() < 60_000) return null;
  if (order.amountTotal !== (q.amountCents / 100).toFixed(2)) return null;
  const expectedSku = skuOf(effectiveSelection(cart, q));
  if (!order.items.some((i) => i.sku === expectedSku)) return null;
  const attempt = await db.query.paymentAttempts.findFirst({
    where: and(eq(paymentAttempts.orderId, order.id), eq(paymentAttempts.method, "pix"), eq(paymentAttempts.provider, gw.name), eq(paymentAttempts.status, "pending")),
    orderBy: desc(paymentAttempts.createdAt),
  });
  return attempt ? order : null;
}

export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  await ensureBootstrap();

  const ip = clientIp(request.headers);
  const ipLimit = await rateLimit(`ck:pay:ip:${ip}`, 10, WINDOW_SECONDS);
  if (!ipLimit.allowed) return tooMany(ipLimit.retryAfterSeconds);

  const body = await readJson(request, MAX_BODY_BYTES);
  if (!body.ok) return body.response;
  const parsed = paySchema.safeParse(body.data);
  if (!parsed.success) {
    // describeInputError só devolve o caminho do campo e uma frase fixa: nunca o valor digitado.
    const { field, message } = describeInputError(parsed.error);
    return fail(400, message, { field });
  }
  const input = parsed.data;

  const s = await getSettings(["checkout.mode", "checkout.bumpEnabled", "checkout.pixTtlSeconds"] as const);
  if (isProd() && s["checkout.mode"] !== "proprio") return fail(503, "Checkout indisponível no momento.");

  const cart = await getCartByToken(input.cartToken);
  if (!cart) return fail(404, "Carrinho não encontrado. Recarregue a página e tente de novo.");
  const cartLimit = await rateLimit(`ck:pay:cart:${cart.id}`, 5, WINDOW_SECONDS);
  if (!cartLimit.allowed) return tooMany(cartLimit.retryAfterSeconds);
  if (cart.status === "converted" || cart.status === "recovered") return fail(409, "Este pedido já foi pago.");
  if (!hasCustomerAndAddress(cart)) return fail(409, "Complete seus dados e o endereço antes de pagar.");

  const gw = await gatewayFor(input.method);
  if (!gw) {
    alertTeam({ event: "falha", cart, attempt: { method: input.method, status: "error" }, problem: `Nenhum gateway ativo e configurado para ${input.method === "pix" ? "Pix" : "cartão"} (confira /admin/gateways).` });
    return fail(503, "Esta forma de pagamento está indisponível. Escolha outra.");
  }

  const card = checkCard(input, gw);
  if (!card.ok) return card.response;

  const bump = s["checkout.bumpEnabled"] && input.bump;
  const sel = selectionFromCart(cart);
  if (bump && sel.pack === "unit") {
    // A 2ª unidade tem cor própria (não repete a da 1ª). Sem cor não cobra: a tela bloqueia antes, isto é a trava do servidor.
    if (!input.bumpColor) return fail(400, "Escolha a cor da 2ª unidade.", { field: "bumpColor" });
    const colors = [sel.colors[0], input.bumpColor];
    if (cart.colors[0] !== colors[0] || cart.colors[1] !== colors[1] || cart.colors.length !== 2) {
      await db.update(checkoutCarts).set({ colors, bumpAccepted: true, updatedAt: new Date() }).where(eq(checkoutCarts.id, cart.id));
      cart.colors = colors; // SKU, itens do pedido e reusablePix leem colors[1]
    }
  }
  const q = await quote(sel.pack, input.method, bump, input.installments, input.coupon);
  if (input.method === "card" && input.installments > q.installments) return fail(400, "Número de parcelas indisponível.", { field: "installments" });

  const postbackUrl = await postbackUrlFor(gw.name);
  if (!postbackUrl) {
    log.error("checkout pay: gateway.postbackToken vazio; gere o token no painel", { gateway: gw.name });
    alertTeam({ event: "falha", cart, attempt: { method: input.method, status: "error", gateway: gw.name }, problem: "Token de postback vazio: gere o token em /admin/gateways." });
    return fail(503, "Esta forma de pagamento está indisponível. Escolha outra.");
  }

  if (input.method === "pix") {
    const existing = await reusablePix(cart, q, gw);
    if (existing?.pixCode && existing.pixExpiresAt) {
      return payResponse(200, {
        ok: true,
        status: "pending",
        orderNumber: existing.orderNumber,
        publicToken: existing.publicToken,
        pix: { code: existing.pixCode, qrUrl: pixQrForScreen(existing.pixCode, existing.pixQrUrl), expiresAt: existing.pixExpiresAt.toISOString() },
        message: null,
      });
    }
  }

  let document: string;
  try {
    document = onlyDigits(decryptText(cart.customerDocumentEnc!));
  } catch (err) {
    log.error("checkout pay: não foi possível ler o CPF do carrinho", { cartId: cart.id, error: errorMessage(err) });
    return fail(500, GENERIC_ERROR);
  }

  let order: Order;
  try {
    ({ order } = await createOrderFromCart(cart, q));
  } catch (err) {
    log.error("checkout pay: falha ao criar pedido", { cartId: cart.id, error: errorMessage(err) });
    alertTeam({ event: "falha", cart, attempt: { method: input.method, status: "error", amountCents: q.amountCents, gateway: gw.name }, problem: "Não foi possível criar o pedido (erro interno; veja os logs)." });
    return fail(500, GENERIC_ERROR);
  }

  const attemptId = randomUUID();
  await db.insert(paymentAttempts).values({
    id: attemptId,
    orderId: order.id,
    cartId: cart.id,
    provider: gw.name,
    method: input.method,
    status: "pending",
    amountCents: q.amountCents,
    installments: q.installments,
    cardBrand: card.brand,
    cardLast4: card.last4,
  });

  const effective = effectiveSelection(cart, q);
  const chargeInput: ChargeInput = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountCents: q.amountCents,
    method: input.method,
    installments: q.installments,
    pack: q.pack,
    title: titleOf(effective),
    sku: skuOf(effective),
    customer: {
      name: cart.customerName!,
      email: cart.customerEmail!,
      phone: onlyDigits(cart.customerPhone!),
      document,
      address: {
        street: cart.addressLine1!,
        number: cart.addressNumber!,
        extra: cart.addressLine2 ?? undefined,
        neighborhood: cart.addressNeighborhood!,
        city: cart.addressCity!,
        state: cart.addressState!,
        zip: onlyDigits(cart.addressPostalCode!),
      },
    },
    idempotencyKey: attemptId,
    pixTtlSeconds: s["checkout.pixTtlSeconds"],
    postbackUrl,
    clientIp: ip !== "unknown" ? ip : undefined,
    card: input.method === "card" && !gw.tokenizesCard ? input.card : undefined,
    cardToken: input.method === "card" && gw.tokenizesCard ? input.cardToken : undefined,
    cardBrand: input.method === "card" ? (input.cardBrand ?? card.brand ?? undefined) : undefined,
    cardPaymentMethodId: input.method === "card" && gw.tokenizesCard ? input.cardPaymentMethodId : undefined,
    cardIssuerId: input.method === "card" && gw.tokenizesCard ? input.cardIssuerId : undefined,
    cardLast4: input.method === "card" ? (card.last4 ?? undefined) : undefined,
  };

  let result: ChargeResult;
  try {
    result = await gw.charge(chargeInput);
  } catch (err) {
    log.error("checkout pay: o gateway lançou erro", { attemptId, gateway: gw.name, error: scrub(errorMessage(err)) });
    result = { ok: false, status: "error", transactionId: null, reason: "exceção ao chamar o gateway" };
  }

  try {
    await db
      .update(paymentAttempts)
      .set({
        providerTransactionId: result.transactionId,
        status: result.status,
        statusReason: result.reason ? scrub(result.reason) : null,
        cardBrand: result.cardBrand ?? card.brand,
        cardLast4: result.cardLast4 && /^\d{4}$/.test(result.cardLast4) ? result.cardLast4 : card.last4,
        updatedAt: new Date(),
      })
      .where(eq(paymentAttempts.id, attemptId));
  } catch (err) {
    // Ex.: transactionId repetido (unique provider+tx). A cobrança já existe no gateway: registra e segue.
    log.error("checkout pay: falha ao gravar a tentativa", { attemptId, gateway: gw.name, error: scrub(errorMessage(err)) });
  }

  const base = { orderNumber: order.orderNumber, publicToken: order.publicToken };
  const attempt = {
    method: input.method,
    status: result.status,
    amountCents: q.amountCents,
    installments: input.method === "card" ? q.installments : null,
    cardBrand: result.cardBrand ?? card.brand,
    cardLast4: card.last4,
    reason: result.reason ? scrub(result.reason) : null,
    gateway: gw.name,
  };
  // Cartão aprovado, em análise ou recusado: um aviso por tentativa. Erro do gateway vira "falha" (lá embaixo).
  if (input.method === "card" && result.status !== "error") alertTeam({ event: "cartao", cart, order, attempt });

  if (result.status === "paid") {
    const applied = await applyPaymentStatus({ orderId: order.id, paymentStatus: "paid", source: "checkout", dedupeKey: `own:${attemptId}` });
    if (applied.becamePaid) await onOrderPaid(applied.order);
    return payResponse(200, { ok: true, status: "paid", ...base, pix: null, message: null });
  }

  if (result.status === "pending" && input.method === "pix") {
    if (!result.pix?.code) {
      log.error("checkout pay: Pix pendente sem código", { attemptId, gateway: gw.name });
      alertTeam({ event: "falha", cart, order, attempt, problem: "O gateway aceitou o Pix mas não devolveu o código copia-e-cola." });
      return payResponse(502, { ok: false, status: "error", ...base, pix: null, message: GENERIC_ERROR });
    }
    const expiresAt = result.pix.expiresAt instanceof Date && !Number.isNaN(result.pix.expiresAt.getTime()) ? result.pix.expiresAt : new Date(Date.now() + s["checkout.pixTtlSeconds"] * 1000);
    await updateOrderFields(order.id, {
      pixCode: result.pix.code,
      pixQrUrl: result.pix.qrUrl ?? null,
      pixExpiresAt: expiresAt,
      paymentUrl: appUrl(`/checkout/pedido/${order.publicToken}`),
    });
    const orderId = order.id;
    alertTeam({ event: "pix", cart, order, attempt });
    after(async () => {
      try {
        const fresh = await getOrderById(orderId);
        if (fresh) await sendOrderEmail(fresh, "pix_pending", { automatic: true });
      } catch (err) {
        log.error("checkout pay: falha no e-mail do Pix", { orderId, error: errorMessage(err) });
      }
    });
    return payResponse(200, { ok: true, status: "pending", ...base, pix: { code: result.pix.code, qrUrl: pixQrForScreen(result.pix.code, result.pix.qrUrl), expiresAt: expiresAt.toISOString() }, message: null });
  }

  if (result.status === "pending") {
    // Cartão em análise: o postback/consulta de status resolve depois.
    return payResponse(200, { ok: true, status: "pending", ...base, pix: null, message: result.message ?? "Pagamento em análise. Avisaremos por e-mail." });
  }

  if (result.status === "refused") {
    // Não cancela o pedido: o comprador pode tentar outro cartão ou o Pix.
    await addOrderEvent({ orderId: order.id, title: "Pagamento recusado", description: "O pagamento não foi autorizado. O pedido continua aguardando pagamento.", source: "checkout", dedupeKey: `own:${attemptId}:refused` });
    return payResponse(402, { ok: false, status: "refused", ...base, pix: null, message: result.message ?? REFUSED_DEFAULT });
  }

  log.warn("checkout pay: cobrança não criada", { attemptId, gateway: gw.name, status: result.status, reason: result.reason ? scrub(result.reason) : undefined });
  alertTeam({ event: "falha", cart, order, attempt, problem: `O gateway ${gw.name} não criou a cobrança (${input.method === "pix" ? "Pix" : "cartão"}). O comprador viu a mensagem de erro.` });
  return payResponse(502, { ok: false, status: "error", ...base, pix: null, message: result.message ?? GENERIC_ERROR });
}
