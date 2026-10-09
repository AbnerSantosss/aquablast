import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { checkoutCarts, orders, paymentAttempts, type CheckoutCart, type Order } from "@/db/schema";
import { randomToken } from "@/lib/crypto";
import { addOrderEvent, generateOrderNumber, getOrderById, updateOrderFields } from "@/lib/orders/service";
import { selectionFromCart, type Selection } from "./catalog";
import { orderItemFromQuote } from "./order-pricing";
import type { Quote } from "./pricing";

/** Provider gravado em orders.checkoutProvider para pedidos do checkout próprio. */
export const OWN_PROVIDER = "proprio";

/**
 * Seleção efetiva do pedido: kit fica como está; unidade com bump vira kit com a 2ª cor
 * (se o carrinho guardou duas cores) ou repete a 1ª cor.
 */
export function effectiveSelection(cart: CheckoutCart, q: Quote): Selection {
  const base = selectionFromCart(cart);
  if (q.pack === "unit") return { pack: "unit", colors: [base.colors[0]] };
  const raw = cart.colors.filter((c): c is Selection["colors"][number] => c === "azul" || c === "vermelho" || c === "preto");
  return { pack: "kit", colors: [raw[0] ?? base.colors[0], raw[1] ?? raw[0] ?? base.colors[0]] };
}

/** Dados atuais do comprador e da entrega, inclusive ao reaproveitar um pedido pendente. */
export function orderContactFromCart(cart: CheckoutCart) {
  const extra = cart.addressLine2?.trim() ?? "";
  const recipient = cart.recipient && cart.recipient.trim() !== (cart.customerName ?? "").trim() ? `A/C ${cart.recipient.trim()}` : "";
  return {
    customerName: cart.customerName,
    customerEmail: cart.customerEmail?.toLowerCase() ?? null,
    customerPhone: cart.customerPhone,
    customerDocumentEnc: cart.customerDocumentEnc,
    addressLine1: [cart.addressLine1, cart.addressNumber].filter(Boolean).join(", ") || null,
    addressLine2: [extra, recipient].filter(Boolean).join(" - ") || null,
    addressNeighborhood: cart.addressNeighborhood,
    addressCity: cart.addressCity,
    addressState: cart.addressState,
    addressPostalCode: cart.addressPostalCode,
    addressCountry: "Brasil",
  };
}

/**
 * Cria o pedido a partir do carrinho no momento do pagamento (Fase 4.7). Só servidor.
 * - Reaproveita o pedido pendente já ligado ao carrinho (cart.orderId) quando o comprador tenta de novo
 *   (cartão recusado, trocou Pix por cartão...): atualiza método/parcelas/valor/itens e devolve `created: false`.
 * - Senão cria pedido novo: checkoutProvider "proprio", externalId = cart.id (ou cart.id + sufixo, se o pedido
 *   anterior do carrinho já estiver cancelado), publicToken aleatório, itens/valor da cotação, endereço e
 *   identificadores copiados do carrinho (ids de anúncio só quando o carrinho tem consentimento).
 * - orders não tem coluna de número nem de destinatário: número vai em addressLine1 ("Rua, 123") e o
 *   destinatário em addressLine2 ("A/C Nome") quando for diferente do comprador.
 * O carrinho fica ligado ao pedido (checkout_carts.orderId) mas continua `open` até pagar.
 */
export async function createOrderFromCart(cart: CheckoutCart, q: Quote): Promise<{ order: Order; created: boolean }> {
  const sel = effectiveSelection(cart, q);
  const items = [orderItemFromQuote(sel, q)];
  const amountTotal = (q.amountCents / 100).toFixed(2);

  const previous = cart.orderId ? await getOrderById(cart.orderId) : null;
  if (previous && previous.paymentStatus === "pending" && previous.status !== "cancelled") {
    await updateOrderFields(previous.id, { ...orderContactFromCart(cart), paymentMethod: q.method, installments: q.installments, amountTotal, items, pixCode: null, pixQrUrl: null, pixExpiresAt: null });
    return { order: (await getOrderById(previous.id))!, created: false };
  }

  const values: typeof orders.$inferInsert = {
    orderNumber: generateOrderNumber(),
    externalId: previous ? `${cart.id}:${Date.now().toString(36)}` : cart.id,
    checkoutProvider: OWN_PROVIDER,
    status: "created",
    paymentStatus: "pending",
    paymentMethod: q.method,
    installments: q.installments,
    publicToken: randomToken(24),
    cartId: cart.id,
    ...orderContactFromCart(cart),
    items,
    amountTotal,
    currency: "BRL",
    utm: cart.utm ?? undefined,
    fbp: cart.consent ? cart.fbp : null,
    fbc: cart.consent ? cart.fbc : null,
    gaClientId: cart.consent ? cart.gaClientId : null,
    gaSessionId: cart.consent ? cart.gaSessionId : null,
    clientIp: cart.clientIp,
    userAgent: cart.userAgent,
    trackingConsent: cart.consent,
  };

  let [order] = await db.insert(orders).values(values).onConflictDoNothing({ target: orders.orderNumber }).returning();
  if (!order) [order] = await db.insert(orders).values({ ...values, orderNumber: generateOrderNumber() }).returning();

  await addOrderEvent({ orderId: order.id, title: "Pedido recebido", description: "Pedido criado no checkout do site.", source: "checkout", status: "created", dedupeKey: `own:${order.id}:created` });
  await db.update(checkoutCarts).set({ orderId: order.id, step: "pagamento", lastActivityAt: new Date(), updatedAt: new Date() }).where(eq(checkoutCarts.id, cart.id));
  return { order, created: true };
}

/** Pedido do checkout próprio pelo token público da página /checkout/pedido/<token>. */
export async function getOrderByPublicToken(token: string): Promise<Order | null> {
  if (!token) return null;
  return (await db.query.orders.findFirst({ where: eq(orders.publicToken, token) })) ?? null;
}

/**
 * Carrinho que originou o pedido (checkout_carts.order_id). Usado pela página do pedido pago para mostrar a
 * confirmação com o mesmo layout do checkout (seleção, bump, destinatário e número do endereço só existem no carrinho).
 */
export async function getCartByOrderId(orderId: string): Promise<CheckoutCart | null> {
  const [cart] = await db.select().from(checkoutCarts).where(eq(checkoutCarts.orderId, orderId)).orderBy(desc(checkoutCarts.updatedAt)).limit(1);
  return cart ?? null;
}

/** Última tentativa paga do pedido: forma, parcelas, bandeira e 4 últimos dígitos (nunca o número inteiro). */
export async function getLastPaidAttempt(orderId: string) {
  const [attempt] = await db
    .select({
      provider: paymentAttempts.provider,
      method: paymentAttempts.method,
      amountCents: paymentAttempts.amountCents,
      installments: paymentAttempts.installments,
      cardBrand: paymentAttempts.cardBrand,
      cardLast4: paymentAttempts.cardLast4,
    })
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.orderId, orderId), eq(paymentAttempts.status, "paid")))
    .orderBy(desc(paymentAttempts.createdAt))
    .limit(1);
  return attempt ?? null;
}
