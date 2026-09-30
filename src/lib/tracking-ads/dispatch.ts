import { and, eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { conversionEvents, type CheckoutCart, type Order } from "@/db/schema";
import { selectionFromCart, skuOf, titleOf, variantOf, type Selection } from "@/lib/checkout/own/catalog";
import { getCartById } from "@/lib/checkout/own/cart";
import { errorMessage, log } from "@/lib/log";
import { getSettings } from "@/lib/settings";
import { sendGa4Event, type Ga4EventInput } from "./ga4-mp";
import { defaultSourceUrl, hashMetaUserData, sendMetaEvent, type MetaEventInput } from "./meta-capi";
import type { TrackDestination, TrackResult, TrackServerEventArgs } from "./types";

/**
 * Disparo dos eventos de anúncio pelo SERVIDOR (plano 9.6, revisado 2026-09-27 03h16). SÓ SERVIDOR.
 * Sem GTM/dataLayer/pixel no navegador para o checkout: InitiateCheckout, AddPaymentInfo e Purchase saem daqui.
 *
 * Fluxo por destino ligado (ads.meta.enabled / ads.ga4.enabled):
 *   1. Sem consentimento (cart.consent / order.trackingConsent falso) e ads.consentRequired verdadeiro
 *      → grava "skipped: sem consentimento" e não envia.
 *   2. "Reserva" o evento em conversion_events com insert … onConflictDoNothing na unique
 *      (destination, eventName, eventId). Se a linha já existia, NÃO reenvia (é isso que impede Purchase em
 *      dobro quando o postback chega duas vezes). Exceção: linha em "error" (ou presa em "sending" há mais de
 *      5 min) é reaproveitada por UPDATE condicional, que é atômico: só uma chamada ganha a vez.
 *   3. Envia (Meta CAPI / GA4 MP), cada destino no seu try/catch.
 *   4. Atualiza a linha: "sent" ou "error" + detalhe (HTTP e mensagem; NUNCA o token).
 * Status possíveis da linha: sending (transitório) | sent | error | skipped.
 *
 * Ids (determinísticos, ver types.ts): ic-<visit> (ou ic-<cart.token>), api-<cart.token>, pur-<order.orderNumber>.
 * InitiateCheckout sai na ABERTURA do checkout (args.visit, sem carrinho) e o carrinho repete o mesmo ic-<visit>:
 * a reserva em conversion_events deixa passar só o primeiro.
 */

const STALE_SENDING_MS = 5 * 60_000;

/**
 * Purchase para pedidos que ainda chegam pela Zedy (ingest.ts). DESLIGADO por padrão (plano 9.6):
 * enquanto a Zedy também manda Purchase pelo Pixel dela, ligar isto conta a venda em dobro.
 * Para ligar: trocar para true aqui (ou, no futuro, virar setting no painel de Pixels).
 */
export const ZEDY_PURCHASE_ENABLED = false;

export async function zedyPurchaseEnabled(): Promise<boolean> {
  return ZEDY_PURCHASE_ENABLED;
}

/* ------------------------------------------------------------------ contexto do evento */

interface EventItem {
  id: string;
  name: string;
  variant?: string;
  quantity: number;
  priceCents: number;
}

interface EventContext {
  consent: boolean;
  cartId: string | null;
  orderId: string | null;
  eventTime: Date;
  valueCents: number;
  items: EventItem[];
  transactionId?: string;
  user: {
    email?: string | null;
    phone?: string | null;
    name?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    externalId?: string | null;
  };
  fbp?: string;
  fbc?: string;
  gaClientId?: string;
  gaSessionId?: string;
  clientIp?: string;
  userAgent?: string;
  sourceUrl?: string;
  /** Só utm_* (sem gclid), só no Purchase. */
  utm?: Record<string, string>;
}

/** Só as chaves utm_* (o gclid, guardado junto em `utm`, é do Google e não vai para a Meta). */
function utmOnly(utm: Record<string, string> | null | undefined): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(utm ?? {})) if (/^utm_[a-z_]{1,30}$/.test(k) && v?.trim()) out[k] = v.trim();
  return Object.keys(out).length ? out : undefined;
}

const pick = (...vals: (string | null | undefined)[]): string | undefined => {
  for (const v of vals) if (v && v.trim()) return v.trim();
  return undefined;
};

/** Seleção efetiva do carrinho: unidade + bump aceito vira kit (mesma regra de effectiveSelection). */
function cartSelection(cart: CheckoutCart): Selection {
  const base = selectionFromCart(cart);
  if (base.pack !== "unit" || !cart.bumpAccepted) return base;
  return selectionFromCart({ pack: "kit", colors: [base.colors[0], cart.colors[1] ?? base.colors[0]] });
}

function itemsFromOrder(order: Order): EventItem[] {
  return (order.items ?? []).map((i) => ({
    id: i.sku?.trim() || i.name,
    name: i.name,
    variant: i.variant ?? undefined,
    quantity: i.quantity > 0 ? i.quantity : 1,
    priceCents: Math.round(Number(i.unitPrice ?? 0) * 100),
  }));
}

async function buildContext(args: TrackServerEventArgs): Promise<EventContext | null> {
  const order = args.order ?? null;
  let cart = args.cart ?? null;
  if (!cart && order?.cartId) cart = await getCartById(order.cartId);
  if (!cart && !order) return args.visit ? visitContext(args.visit) : null;

  // Consentimento: do pedido quando existe (copiado do carrinho na hora de pagar), senão do carrinho.
  const consent = order ? order.trackingConsent : (cart?.consent ?? false);
  // Identificadores de anúncio só existem no banco com consentimento (cart.ts / order.ts já garantem).
  const idsFromCart = cart && cart.consent ? cart : null;

  let valueCents: number;
  let items: EventItem[];
  if (args.name === "Purchase" && order) {
    const total = Number(order.amountTotal ?? 0);
    valueCents = Number.isFinite(total) ? Math.round(total * 100) : 0;
    items = itemsFromOrder(order);
  } else if (cart) {
    const sel = cartSelection(cart);
    valueCents = cart.amountCents;
    items = [{ id: skuOf(sel), name: titleOf(sel), variant: variantOf(sel), quantity: 1, priceCents: cart.amountCents }];
  } else {
    const total = Number(order?.amountTotal ?? 0);
    valueCents = Number.isFinite(total) ? Math.round(total * 100) : 0;
    items = order ? itemsFromOrder(order) : [];
  }

  return {
    consent,
    cartId: cart?.id ?? null,
    orderId: order?.id ?? null,
    eventTime: args.name === "Purchase" && order?.paidAt ? order.paidAt : new Date(),
    valueCents,
    items,
    transactionId: args.name === "Purchase" && order ? order.orderNumber : undefined,
    user: {
      email: pick(order?.customerEmail, cart?.customerEmail),
      phone: pick(order?.customerPhone, cart?.customerPhone),
      name: pick(order?.customerName, cart?.customerName),
      city: pick(order?.addressCity, cart?.addressCity),
      state: pick(order?.addressState, cart?.addressState),
      zip: pick(order?.addressPostalCode, cart?.addressPostalCode),
      // Mesmo id nos três eventos da mesma compra: o do carrinho (pedidos da Zedy não têm carrinho → id do pedido).
      externalId: cart?.id ?? order?.id ?? null,
    },
    fbp: pick(order?.fbp, idsFromCart?.fbp),
    fbc: pick(order?.fbc, idsFromCart?.fbc),
    gaClientId: pick(order?.gaClientId, idsFromCart?.gaClientId),
    gaSessionId: pick(order?.gaSessionId, idsFromCart?.gaSessionId),
    clientIp: pick(order?.clientIp, cart?.clientIp),
    userAgent: pick(order?.userAgent, cart?.userAgent),
    utm: args.name === "Purchase" ? utmOnly(order?.utm ?? cart?.utm) : undefined,
  };
}

/** Checkout aberto sem carrinho: 1 item (o pacote escolhido), nenhum dado pessoal além do id de visitante. */
function visitContext(v: NonNullable<TrackServerEventArgs["visit"]>): EventContext {
  return {
    consent: v.consent,
    cartId: null,
    orderId: null,
    eventTime: new Date(),
    valueCents: v.valueCents,
    items: [{ id: skuOf(v.selection), name: titleOf(v.selection), variant: variantOf(v.selection), quantity: 1, priceCents: v.valueCents }],
    user: { externalId: v.visitorId ?? null },
    fbp: v.fbp,
    fbc: v.fbc,
    gaClientId: v.gaClientId,
    gaSessionId: v.gaSessionId,
    clientIp: v.clientIp,
    userAgent: v.userAgent,
    sourceUrl: v.sourceUrl,
  };
}

/* ------------------------------------------------------------------ conversion_events */

type RowStatus = "sending" | "sent" | "error" | "skipped";

/** Tenta reservar a linha. true = esta chamada ganhou a vez de enviar; false = já existe (dedupe). */
async function claim(dest: TrackDestination, args: TrackServerEventArgs, ctx: EventContext, status: RowStatus, detail: string | null): Promise<{ claimed: boolean; existing?: string }> {
  const inserted = await db
    .insert(conversionEvents)
    .values({ destination: dest, eventName: args.name, eventId: args.eventId, status, detail, orderId: ctx.orderId, cartId: ctx.cartId, sentAt: new Date() })
    .onConflictDoNothing({ target: [conversionEvents.destination, conversionEvents.eventName, conversionEvents.eventId] })
    .returning({ id: conversionEvents.id });
  if (inserted.length) return { claimed: true };
  if (status !== "sending") return { claimed: false, existing: "já registrado" };

  // Linha já existe: só reaproveita se a tentativa anterior falhou (ou ficou presa em "sending").
  const stale = new Date(Date.now() - STALE_SENDING_MS);
  const retaken = await db
    .update(conversionEvents)
    .set({ status: "sending", detail: "reenviando", sentAt: new Date(), orderId: ctx.orderId, cartId: ctx.cartId })
    .where(
      and(
        eq(conversionEvents.destination, dest),
        eq(conversionEvents.eventName, args.name),
        eq(conversionEvents.eventId, args.eventId),
        or(eq(conversionEvents.status, "error"), and(eq(conversionEvents.status, "sending"), lt(conversionEvents.sentAt, stale))),
      ),
    )
    .returning({ id: conversionEvents.id });
  if (retaken.length) return { claimed: true };
  const row = await db.query.conversionEvents.findFirst({
    where: and(eq(conversionEvents.destination, dest), eq(conversionEvents.eventName, args.name), eq(conversionEvents.eventId, args.eventId)),
  });
  return { claimed: false, existing: row?.status ?? "já registrado" };
}

async function finish(dest: TrackDestination, args: TrackServerEventArgs, status: RowStatus, detail: string, payload?: Record<string, unknown>): Promise<void> {
  await db
    .update(conversionEvents)
    .set({ status, detail: detail.slice(0, 500), sentAt: new Date(), ...(payload ? { payload } : {}) })
    .where(and(eq(conversionEvents.destination, dest), eq(conversionEvents.eventName, args.name), eq(conversionEvents.eventId, args.eventId)));
}

/** Grava um "skipped" final (sem consentimento, sem client_id...). Se já havia linha, não mexe nela. */
async function skip(dest: TrackDestination, args: TrackServerEventArgs, ctx: EventContext, detail: string): Promise<TrackResult> {
  const r = await claim(dest, args, ctx, "skipped", detail);
  return { destination: dest, status: "skipped", detail: r.claimed ? detail : `duplicado: evento já registrado (${r.existing})` };
}

/* ------------------------------------------------------------------ destinos */

function metaInput(args: TrackServerEventArgs, ctx: EventContext): MetaEventInput {
  const numItems = ctx.items.reduce((n, i) => n + i.quantity, 0);
  return {
    eventName: args.name,
    eventId: args.eventId,
    eventTime: ctx.eventTime,
    sourceUrl: ctx.sourceUrl ?? defaultSourceUrl("/checkout"),
    hashed: hashMetaUserData({ ...ctx.user, country: "br" }),
    fbp: ctx.fbp,
    fbc: ctx.fbc,
    clientIp: ctx.clientIp,
    userAgent: ctx.userAgent,
    valueCents: ctx.valueCents,
    contentIds: ctx.items.map((i) => i.id),
    contents: ctx.items.map((i) => ({ id: i.id, quantity: i.quantity, itemPriceCents: i.priceCents })),
    numItems: numItems || undefined,
    orderId: ctx.transactionId,
    utm: ctx.utm,
  };
}

function ga4Input(args: TrackServerEventArgs, ctx: EventContext): Ga4EventInput {
  return {
    eventName: args.name,
    eventId: args.eventId,
    clientId: ctx.gaClientId ?? "",
    sessionId: ctx.gaSessionId,
    transactionId: ctx.transactionId,
    valueCents: ctx.valueCents,
    eventTime: ctx.eventTime,
    items: ctx.items.map((i) => ({ itemId: i.id, itemName: i.name, itemVariant: i.variant, quantity: i.quantity, priceCents: i.priceCents })),
  };
}

async function runDestination(dest: TrackDestination, args: TrackServerEventArgs, ctx: EventContext, consentRequired: boolean, eventAllowed = true): Promise<TrackResult> {
  try {
    // Evento desmarcado em Pixels (ads.meta.events): ex. o gateway já manda o Purchase direto para a Meta.
    if (!eventAllowed) return await skip(dest, args, ctx, "evento desmarcado no painel (Pixels)");
    if (consentRequired && !ctx.consent) return await skip(dest, args, ctx, "sem consentimento");
    if (dest === "ga4" && !ctx.gaClientId) return await skip(dest, args, ctx, "sem client_id (cookie _ga ausente)");

    const c = await claim(dest, args, ctx, "sending", null);
    if (!c.claimed) return { destination: dest, status: "skipped", detail: `duplicado: evento já registrado (${c.existing})` };

    let result: { ok: boolean; detail?: string; payload?: Record<string, unknown> };
    try {
      result = dest === "meta" ? await sendMetaEvent(metaInput(args, ctx)) : await sendGa4Event(ga4Input(args, ctx));
    } catch (err) {
      result = { ok: false, detail: `${dest}: ${errorMessage(err)}` };
    }
    const detail = (result.detail ?? (result.ok ? "enviado" : "falhou")).slice(0, 500);
    await finish(dest, args, result.ok ? "sent" : "error", detail, result.payload);
    if (!result.ok) log.warn("tracking-ads: envio falhou", { destination: dest, event: args.name, eventId: args.eventId, detail });
    return { destination: dest, status: result.ok ? "sent" : "error", detail };
  } catch (err) {
    const detail = `${dest}: ${errorMessage(err)}`.slice(0, 500);
    log.error("tracking-ads: erro no destino", { destination: dest, event: args.name, eventId: args.eventId, detail });
    try {
      await finish(dest, args, "error", detail);
    } catch {
      // a linha pode nem existir; nada a fazer
    }
    return { destination: dest, status: "error", detail };
  }
}

/* ------------------------------------------------------------------ API pública */

/** Versão que devolve o resultado por destino (para o painel/diagnóstico). Nunca lança. */
export async function trackServerEventDetailed(args: TrackServerEventArgs): Promise<TrackResult[]> {
  try {
    if (!args.eventId?.trim()) return [];
    const s = await getSettings(["ads.meta.enabled", "ads.ga4.enabled", "ads.consentRequired", "ads.meta.events"] as const);
    const destinations: TrackDestination[] = [];
    if (s["ads.meta.enabled"] === true) destinations.push("meta");
    if (s["ads.ga4.enabled"] === true) destinations.push("ga4");
    if (!destinations.length) return [];

    const ctx = await buildContext(args);
    if (!ctx) return destinations.map((d) => ({ destination: d, status: "skipped", detail: "sem carrinho nem pedido" }));

    const consentRequired = s["ads.consentRequired"] !== false;
    const results: TrackResult[] = [];
    // Lista de eventos da Meta vale só para a Meta; GA4 segue mandando os três.
    const metaEvents: readonly string[] = Array.isArray(s["ads.meta.events"]) ? s["ads.meta.events"] : [];
    for (const dest of destinations) results.push(await runDestination(dest, args, ctx, consentRequired, dest !== "meta" || metaEvents.includes(args.name)));
    return results;
  } catch (err) {
    log.error("tracking-ads: falha ao disparar evento", { event: args.name, eventId: args.eventId, detail: errorMessage(err) });
    return [];
  }
}

/** Dispara o evento em todos os destinos ligados. Nunca lança e nunca derruba a rota que chamou. */
export async function trackServerEvent(args: TrackServerEventArgs): Promise<void> {
  try {
    await trackServerEventDetailed(args);
  } catch {
    // trackServerEventDetailed já não lança; guarda extra por contrato.
  }
}
