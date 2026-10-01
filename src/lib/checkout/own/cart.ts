import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checkoutCarts, type CheckoutCart } from "@/db/schema";
import { randomToken } from "@/lib/crypto";
import { encryptDocument } from "@/lib/orders/service";
import { clientIp } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { onlyDigits } from "./masks";
import { quote } from "./pricing";
import type { CartInput, TrackingInput } from "./schemas";

/**
 * Carrinho do checkout próprio (Fase 4.6). Só servidor.
 * - `upsertCart` é chamado pela rota POST /api/checkout/cart a cada etapa (dados → entrega → pagamento).
 * - Um carrinho `abandoned` que volta a ter atividade volta para `open`.
 * - Um carrinho `converted`/`recovered` não é reaproveitado: gera carrinho novo.
 * - Identificadores de anúncio (fbp, fbc, gaClientId, gaSessionId, gclid) só entram com consentimento
 *   (`tracking.consent === true`) ou quando `ads.consentRequired` está desligado no painel.
 *   utm_* não identificam a pessoa e são guardados sempre. O gclid vai dentro de `utm` com a chave "gclid".
 * - `amountCents` guarda o preço no Pix do pack efetivo (unidade + bump = kit): é o valor anunciado nos
 *   e-mails de carrinho abandonado. O valor cobrado é sempre recalculado em quote() na hora de pagar.
 */

const UTM_KEY = /^utm_[a-z_]{1,30}$/i;

/** Mantém só utm_* (e o gclid, se houver consentimento), com valores curtos. */
export function sanitizeUtm(input: Record<string, string> | undefined, previous: Record<string, string> | null | undefined, gclid: string | undefined): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(previous ?? {})) out[k] = v;
  for (const [k, v] of Object.entries(input ?? {})) {
    const key = k.trim().toLowerCase();
    if (UTM_KEY.test(key) && v.trim()) out[key] = v.trim().slice(0, 200);
  }
  if (gclid?.trim()) out.gclid = gclid.trim().slice(0, 200);
  return Object.keys(out).length ? out : null;
}

function trackingPatch(t: TrackingInput | undefined, previous: CheckoutCart | null, consent: boolean): Partial<typeof checkoutCarts.$inferInsert> {
  if (!t) return previous ? {} : { consent };
  if (!consent) {
    // Consentimento negado (ou revogado): nunca guardar identificadores; utm_* pode ficar.
    return { consent: false, fbp: null, fbc: null, gaClientId: null, gaSessionId: null, utm: sanitizeUtm(t.utm, stripGclid(previous?.utm), undefined) };
  }
  return {
    consent: true,
    fbp: t.fbp ?? previous?.fbp ?? null,
    fbc: t.fbc ?? previous?.fbc ?? null,
    gaClientId: t.gaClientId ?? previous?.gaClientId ?? null,
    gaSessionId: t.gaSessionId ?? previous?.gaSessionId ?? null,
    utm: sanitizeUtm(t.utm, previous?.utm, t.gclid),
  };
}

function stripGclid(utm: Record<string, string> | null | undefined): Record<string, string> | undefined {
  if (!utm) return undefined;
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(utm)) if (k !== "gclid") rest[k] = v;
  return rest;
}

export async function getCartByToken(token: string): Promise<CheckoutCart | null> {
  if (!token) return null;
  return (await db.query.checkoutCarts.findFirst({ where: eq(checkoutCarts.token, token) })) ?? null;
}

export async function getCartById(id: string): Promise<CheckoutCart | null> {
  return (await db.query.checkoutCarts.findFirst({ where: eq(checkoutCarts.id, id) })) ?? null;
}

/**
 * Cores gravadas no carrinho. Unidade + bump com cor escolhida = [cor da 1ª, cor da 2ª] (o kit efetivo lê colors[1]).
 * Bump marcado ainda sem cor fica só com a 1ª: o pagamento recusa até o cliente escolher.
 */
export function cartColorsOf(input: Pick<CartInput, "selection" | "bump" | "bumpColor">): string[] {
  if (input.selection.pack !== "unit") return input.selection.colors;
  const first = input.selection.colors[0];
  return input.bump && input.bumpColor ? [first, input.bumpColor] : [first];
}

/**
 * Cria ou atualiza o carrinho. `created === true` quando nasceu um carrinho novo (é aí que a rota dispara InitiateCheckout).
 * O CPF entra cifrado (encryptDocument); telefone e CEP só dígitos; e-mail minúsculo.
 */
export async function upsertCart(input: CartInput, headers: Headers): Promise<{ cart: CheckoutCart; created: boolean }> {
  const found = input.token ? await getCartByToken(input.token) : null;
  const existing = found && (found.status === "converted" || found.status === "recovered") ? null : found;

  const consentRequired = await getSetting("ads.consentRequired");
  const consent = input.tracking ? input.tracking.consent === true || !consentRequired : (existing?.consent ?? !consentRequired);

  const q = await quote(input.selection.pack, "pix", input.bump, 1);
  const now = new Date();
  const colors = cartColorsOf(input);

  const patch: Partial<typeof checkoutCarts.$inferInsert> = {
    status: "open",
    step: input.step,
    pack: input.selection.pack,
    colors,
    bumpAccepted: input.bump,
    amountCents: q.amountCents,
    clientIp: clientIp(headers).slice(0, 80) || null,
    userAgent: headers.get("user-agent")?.slice(0, 300) ?? null,
    lastActivityAt: now,
    updatedAt: now,
    ...trackingPatch(input.tracking, existing, consent),
  };

  if (input.lead) {
    // Parcial: só sobrescreve o que veio (o resto do contato já gravado fica).
    if (input.lead.name) patch.customerName = input.lead.name;
    if (input.lead.email) patch.customerEmail = input.lead.email.trim().toLowerCase();
    if (input.lead.phone) patch.customerPhone = onlyDigits(input.lead.phone);
  }
  if (input.customer) {
    patch.customerName = input.customer.name;
    patch.customerEmail = input.customer.email.trim().toLowerCase();
    patch.customerPhone = onlyDigits(input.customer.phone);
    // CPF ausente = carrinho retomado (plano 8.8): a tela só viu o CPF mascarado; mantém o cifrado já gravado.
    if (input.customer.cpf !== undefined) patch.customerDocumentEnc = encryptDocument(input.customer.cpf);
  }
  if (input.address) {
    patch.addressLine1 = input.address.street;
    patch.addressNumber = input.address.number;
    patch.addressLine2 = input.address.extra?.trim() || null;
    patch.addressNeighborhood = input.address.district;
    patch.addressCity = input.address.city;
    patch.addressState = input.address.state.toUpperCase();
    patch.addressPostalCode = onlyDigits(input.address.cep);
    patch.recipient = input.address.recipient;
  }

  if (existing) {
    const [cart] = await db.update(checkoutCarts).set(patch).where(eq(checkoutCarts.id, existing.id)).returning();
    return { cart, created: false };
  }

  const [cart] = await db
    .insert(checkoutCarts)
    .values({
      ...patch,
      token: randomToken(24),
      pack: input.selection.pack,
      colors,
      amountCents: q.amountCents,
      consent,
    })
    .returning();
  return { cart, created: true };
}

/**
 * Marca o carrinho como convertido quando o pedido é PAGO (chamar em todo ponto em que applyPaymentStatus
 * devolve becamePaid). Se já tinha recebido e-mail de recuperação, vira `recovered` (métrica do painel).
 */
export async function markCartConverted(cartId: string, orderId: string): Promise<void> {
  const cart = await getCartById(cartId);
  if (!cart) return;
  await db
    .update(checkoutCarts)
    .set({ status: cart.recoveryEmailCount > 0 ? "recovered" : "converted", step: "concluido", orderId, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(checkoutCarts.id, cartId));
}

/** Liga o carrinho ao pedido criado (antes do pagamento). Não muda status: o carrinho continua `open` até pagar. */
export async function attachCartOrder(cartId: string, orderId: string): Promise<void> {
  await db.update(checkoutCarts).set({ orderId, step: "pagamento", lastActivityAt: new Date(), updatedAt: new Date() }).where(eq(checkoutCarts.id, cartId));
}

/** Registra que o comprador pediu para não receber mais e-mails de carrinho (link do e-mail). */
export async function unsubscribeCart(token: string): Promise<boolean> {
  const cart = await getCartByToken(token);
  if (!cart) return false;
  if (!cart.unsubscribedAt) await db.update(checkoutCarts).set({ unsubscribedAt: new Date(), updatedAt: new Date() }).where(eq(checkoutCarts.id, cart.id));
  return true;
}
