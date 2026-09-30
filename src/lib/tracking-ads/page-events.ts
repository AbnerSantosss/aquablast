import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { conversionEvents, siteVisits } from "@/db/schema";
import { errorMessage, log } from "@/lib/log";
import { getSetting, getSettings } from "@/lib/settings";
import { hashMetaUserData, sendMetaEvent, type MetaEventInput } from "./meta-capi";

/**
 * Visita ao site público (pedido do dono, 2026-09-30: "vamos enviar pelo servidor tb").
 * Cada carregamento de página gera, no navegador, dois ids (window.aqbEvt, script no layout do site):
 * `pv-…` para o PageView e `vc-…` para o ViewContent. O Pixel do GTM manda o evento com esse eventID e
 * POST /api/track/page manda o MESMO id pela API de Conversões: a Meta junta os dois (deduplicação).
 *
 * Também grava site_visits, que alimenta o topo do "Funil da operação" do dashboard.
 * Sem consentimento separado: o Pixel do navegador já dispara PageView/ViewContent na LP sem banner,
 * e o servidor manda os mesmos dados (IP, navegador, fbp/fbc). Nada de nome, e-mail ou telefone.
 */

/** Página do produto: a home. Mesma regra do gatilho do ViewContent no GTM (Page Path igual a "/"). */
export const PRODUCT_PATH = "/";

/** content_ids do ViewContent do navegador (variável "JS - ID do Produto" do GTM, 1 unidade). */
const VIEW_CONTENT_ID = "aquablast-1-unidade";

/** Logs de PageView/ViewContent em conversion_events são muitos: guarda só os últimos dias. */
const PAGE_EVENT_KEEP_DAYS = 7;

export interface PageVisitInput {
  pvId: string;
  /** Só vem na página do produto. */
  vcId?: string;
  url: URL;
  visitorId: string;
  clientIp?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
}

/**
 * Grava a visita. false = o id já existia (recarga do mesmo evento), e aí nada mais deve ser enviado.
 */
export async function recordPageVisit(v: PageVisitInput): Promise<boolean> {
  const inserted = await db
    .insert(siteVisits)
    .values({
      eventId: v.pvId,
      visitorId: v.visitorId,
      path: v.url.pathname.slice(0, 200),
      viewedProduct: v.url.pathname === PRODUCT_PATH,
      utmSource: v.url.searchParams.get("utm_source")?.slice(0, 80) || null,
    })
    .onConflictDoNothing({ target: siteVisits.eventId })
    .returning({ id: siteVisits.id });
  return inserted.length > 0;
}

/** Página do checkout próprio aberta (POST /api/checkout/opened): etapa "abriram o checkout" do funil. */
export const CHECKOUT_PATH = "/checkout";

/** Uma linha por visita ao checkout (id da visita do sessionStorage). Repetir o mesmo id não conta de novo. */
export async function recordCheckoutOpen(visit: string, visitorId: string, utmSource?: string): Promise<void> {
  await db
    .insert(siteVisits)
    .values({ eventId: `ck-${visit}`, visitorId, path: CHECKOUT_PATH, utmSource: utmSource?.slice(0, 80) || null })
    .onConflictDoNothing({ target: siteVisits.eventId });
}

/** Envia PageView (e ViewContent na home) para a Meta, se ligados em Pixels. Nunca lança. */
export async function sendPageEvents(v: PageVisitInput): Promise<void> {
  try {
    const s = await getSettings(["ads.meta.enabled", "ads.meta.events"] as const);
    if (s["ads.meta.enabled"] !== true) return;
    const allowed: readonly string[] = Array.isArray(s["ads.meta.events"]) ? s["ads.meta.events"] : [];

    const base: Omit<MetaEventInput, "eventName" | "eventId"> = {
      eventTime: new Date(),
      sourceUrl: v.url.toString(),
      hashed: hashMetaUserData({ externalId: v.visitorId, country: "br" }),
      fbp: v.fbp,
      fbc: v.fbc,
      clientIp: v.clientIp,
      userAgent: v.userAgent,
    };
    if (allowed.includes("PageView")) await sendOne({ ...base, eventName: "PageView", eventId: v.pvId });
    if (v.vcId && v.url.pathname === PRODUCT_PATH && allowed.includes("ViewContent")) {
      const prices = await getSetting("checkout.prices");
      await sendOne({ ...base, eventName: "ViewContent", eventId: v.vcId, valueCents: prices.unit.pix, contentIds: [VIEW_CONTENT_ID], numItems: 1 });
    }
    if (Math.random() < 0.02) await prunePageEvents();
  } catch (err) {
    log.warn("page-events: falha ao enviar", { detail: errorMessage(err) });
  }
}

/** Mesmo registro dos eventos do checkout (conversion_events): aparece em "Últimos eventos" no painel. */
async function sendOne(input: MetaEventInput): Promise<void> {
  const claimed = await db
    .insert(conversionEvents)
    .values({ destination: "meta", eventName: input.eventName, eventId: input.eventId, status: "sending", sentAt: new Date() })
    .onConflictDoNothing({ target: [conversionEvents.destination, conversionEvents.eventName, conversionEvents.eventId] })
    .returning({ id: conversionEvents.id });
  if (!claimed.length) return;
  const r = await sendMetaEvent(input);
  const detail = (r.detail ?? (r.ok ? "enviado" : "falhou")).slice(0, 500);
  await db
    .update(conversionEvents)
    .set({ status: r.ok ? "sent" : "error", detail, sentAt: new Date(), ...(r.payload ? { payload: r.payload } : {}) })
    .where(eq(conversionEvents.id, claimed[0].id));
  if (!r.ok) log.warn("page-events: Meta recusou", { event: input.eventName, detail });
}

async function prunePageEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - PAGE_EVENT_KEEP_DAYS * 86_400_000);
  await db
    .delete(conversionEvents)
    .where(and(inArray(conversionEvents.eventName, ["PageView", "ViewContent"]), lt(conversionEvents.sentAt, cutoff)));
}
