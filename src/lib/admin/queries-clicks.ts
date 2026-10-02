// Cliques no botão Comprar da LP (pedido do dono, 2026-10-02). Só leitura.
import { and, count, countDistinct, desc, eq, gte, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { buyClicks, orders, siteVisits, type BuyClick } from "@/db/schema";
import { CHECKOUT_PATH } from "@/lib/tracking-ads/page-events";
import { PAGE_SIZE } from "./types";

/** Janela para dizer que o clique "chegou ao checkout": uma abertura do checkout pelo mesmo navegador até 30 min depois. */
const REACH_WINDOW = sql`interval '30 minutes'`;

/** O mesmo navegador abriu o checkout entre o clique e 30 min depois. */
const reachedCheckout = sql<boolean>`exists (
  select 1 from ${siteVisits}
  where ${siteVisits.visitorId} = ${buyClicks.visitorId}
    and ${siteVisits.path} = ${CHECKOUT_PATH}
    and ${siteVisits.createdAt} >= ${buyClicks.createdAt} - interval '5 seconds'
    and ${siteVisits.createdAt} <= ${buyClicks.createdAt} + ${REACH_WINDOW}
)`;

export interface ClickRow extends BuyClick {
  reached: boolean;
}

export interface ClickReport {
  total: number;
  /** Cliques que seguiram para o checkout (não foram só o aviso de cor). */
  wentOn: number;
  warnedOnly: number;
  people: number;
  /** Pessoas que clicaram e abriram o checkout em até 30 min. */
  peopleReached: number;
  /** Cliques que seguiram para o checkout mas o checkout não abriu (sinal de travamento ou desistência na hora). */
  wentOnNotReached: number;
  paidOrders: number;
  byPack: { pack: string; count: number }[];
  byDevice: { device: string; count: number }[];
  byPlace: { place: string; count: number }[];
  byColors: { pack: string; colors: string; count: number }[];
  firstClick: Date | null;
  rows: ClickRow[];
  page: number;
  pages: number;
  rowsTotal: number;
}

export async function getClickReport(range: { start: Date; end: Date }, filters: { pack?: string; device?: string; page: number }): Promise<ClickReport> {
  const period = and(gte(buyClicks.createdAt, range.start), lt(buyClicks.createdAt, range.end))! as SQL;
  const listConds: SQL[] = [period];
  if (filters.pack === "unit" || filters.pack === "kit") listConds.push(eq(buyClicks.pack, filters.pack));
  if (filters.device === "mobile" || filters.device === "desktop") listConds.push(eq(buyClicks.device, filters.device));
  const listWhere = and(...listConds)!;

  const [[totals], byPack, byDevice, byPlace, byColors, [first], [{ value: paidOrders }], [{ value: rowsTotal }]] = await Promise.all([
    db
      .select({
        total: count(),
        warnedOnly: sql<number>`count(*) filter (where ${buyClicks.warnedOnly})`.mapWith(Number),
        people: countDistinct(buyClicks.visitorId),
        peopleReached: sql<number>`count(distinct ${buyClicks.visitorId}) filter (where ${reachedCheckout})`.mapWith(Number),
        wentOnNotReached: sql<number>`count(*) filter (where not ${buyClicks.warnedOnly} and not ${reachedCheckout})`.mapWith(Number),
      })
      .from(buyClicks)
      .where(period),
    db.select({ pack: buyClicks.pack, count: count() }).from(buyClicks).where(period).groupBy(buyClicks.pack).orderBy(desc(count())),
    db.select({ device: buyClicks.device, count: count() }).from(buyClicks).where(period).groupBy(buyClicks.device).orderBy(desc(count())),
    db.select({ place: buyClicks.place, count: count() }).from(buyClicks).where(period).groupBy(buyClicks.place).orderBy(desc(count())),
    db
      .select({ pack: buyClicks.pack, colors: buyClicks.colors, count: count() })
      .from(buyClicks)
      .where(and(period, eq(buyClicks.warnedOnly, false)))
      .groupBy(buyClicks.pack, buyClicks.colors)
      .orderBy(desc(count()))
      .limit(8),
    db.select({ desde: sql<Date | null>`min(${buyClicks.createdAt})` }).from(buyClicks),
    db
      .select({ value: count() })
      .from(orders)
      .where(and(isNotNull(orders.paidAt), gte(orders.paidAt, range.start), lt(orders.paidAt, range.end))),
    db.select({ value: count() }).from(buyClicks).where(listWhere),
  ]);

  const pages = Math.max(1, Math.ceil(rowsTotal / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), pages);
  const rows = await db
    .select({ click: buyClicks, reached: reachedCheckout })
    .from(buyClicks)
    .where(listWhere)
    .orderBy(desc(buyClicks.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const desde = first?.desde ? new Date(first.desde) : null;
  return {
    total: totals.total,
    wentOn: totals.total - totals.warnedOnly,
    warnedOnly: totals.warnedOnly,
    people: totals.people,
    peopleReached: totals.peopleReached,
    wentOnNotReached: totals.wentOnNotReached,
    paidOrders,
    byPack,
    byDevice,
    byPlace,
    byColors,
    firstClick: desde,
    rows: rows.map((r) => ({ ...r.click, reached: !!r.reached })),
    page,
    pages,
    rowsTotal,
  };
}
