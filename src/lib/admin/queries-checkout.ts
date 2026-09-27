// Consultas do painel para Início, Dashboard, Carrinhos abandonados e Clientes (Fase 11.3-11.6).
// Só leitura. Nada aqui inventa métrica que não exista nos dados (sem "visitantes online", sem lucro líquido).
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { checkoutCarts, orders, paymentAttempts, type CheckoutCart, type Order } from "@/db/schema";
import { getGateway, isGatewayName } from "@/lib/gateways";
import { getSettings } from "@/lib/settings";
import { dayBounds, startOfDaySP } from "./format";
import { PAGE_SIZE } from "./types";

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const CART_STEP_LABEL: Record<CheckoutCart["step"], string> = {
  dados: "Dados pessoais",
  entrega: "Entrega",
  pagamento: "Pagamento",
  concluido: "Concluído",
};

export const CART_STATUS_LABEL: Record<CheckoutCart["status"], string> = {
  open: "Em andamento",
  abandoned: "Abandonado",
  recovered: "Recuperado (pagou após lembrete)",
  converted: "Convertido",
};

// ---------- Início (11.3) ----------

export interface HomeSummary {
  salesTodayAmount: number;
  salesTodayCount: number;
  ordersToday: number;
  cartsOpenNow: number;
}

export async function getHomeSummary(): Promise<HomeSummary> {
  const todayStart = startOfDaySP();
  const [salesRow] = await db
    .select({ amount: sql<string>`coalesce(sum(${orders.amountTotal}), 0)`, qty: count() })
    .from(orders)
    .where(and(eq(orders.paymentStatus, "paid"), gte(sql`coalesce(${orders.paidAt}, ${orders.createdAt})`, todayStart))!);
  const [{ value: ordersToday }] = await db.select({ value: count() }).from(orders).where(gte(orders.createdAt, todayStart));
  const activeSince = new Date(Date.now() - 30 * 60_000);
  const [{ value: cartsOpenNow }] = await db
    .select({ value: count() })
    .from(checkoutCarts)
    .where(and(eq(checkoutCarts.status, "open"), gte(checkoutCarts.lastActivityAt, activeSince))!);
  return {
    salesTodayAmount: Number(salesRow.amount),
    salesTodayCount: salesRow.qty,
    ordersToday,
    cartsOpenNow,
  };
}

export interface PendingSetupItem {
  label: string;
  href: string;
}

/** "Falta configurar" do Início: só aponta o que de fato está pendente, nada inventado. */
export async function getPendingSetup(): Promise<PendingSetupItem[]> {
  const items: PendingSetupItem[] = [];
  const s = await getSettings([
    "checkout.mode",
    "gateway.pix",
    "gateway.card",
    "gateway.ironpay.offerHashUnit",
    "gateway.ironpay.offerHashKit",
    "gateway.ironpay.productHashUnit",
    "gateway.ironpay.productHashKit",
    "ads.meta.enabled",
    "ads.ga4.enabled",
    "email.smtp.host",
    "email.smtp.user",
  ] as const);

  if (s["checkout.mode"] !== "proprio") {
    items.push({ label: "Checkout próprio está desligado (modo Zedy)", href: "/admin/checkout" });
  }

  for (const [method, label] of [["pix", "Pix"], ["card", "Cartão"]] as const) {
    const name = method === "pix" ? s["gateway.pix"] : s["gateway.card"];
    if (name === "desligado") continue;
    if (!isGatewayName(name)) continue;
    const configured = await getGateway(name).configured();
    if (!configured) items.push({ label: `Gateway de ${label} (${name}) sem credencial cadastrada`, href: "/admin/gateways" });
  }

  const usesIronpay = s["gateway.pix"] === "ironpay" || s["gateway.card"] === "ironpay";
  if (
    usesIronpay &&
    (!s["gateway.ironpay.offerHashUnit"] || !s["gateway.ironpay.offerHashKit"] || !s["gateway.ironpay.productHashUnit"] || !s["gateway.ironpay.productHashKit"])
  ) {
    items.push({ label: "Hashes de oferta/produto da IronPay não cadastrados", href: "/admin/gateways" });
  }

  if (!s["ads.meta.enabled"]) items.push({ label: "Meta CAPI (rastreamento de anúncios) desligada", href: "/admin/pixels" });
  if (!s["ads.ga4.enabled"]) items.push({ label: "GA4 desligado", href: "/admin/pixels" });
  if (!s["email.smtp.host"] || !s["email.smtp.user"]) items.push({ label: "SMTP de e-mail não configurado", href: "/admin/configuracoes" });

  return items;
}

// ---------- Dashboard (11.4) ----------

export type DashboardPreset = "hoje" | "ontem" | "semana" | "mes" | "ano" | "livre";

export function dashboardRange(preset: string, from?: string, to?: string): { start: Date; end: Date; preset: DashboardPreset } {
  const valid: DashboardPreset[] = ["hoje", "ontem", "semana", "mes", "ano", "livre"];
  const p = (valid as string[]).includes(preset) ? (preset as DashboardPreset) : "hoje";
  const todayStart = startOfDaySP();
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  if (p === "livre") {
    const a = from ? dayBounds(from) : null;
    const b = to ? dayBounds(to) : null;
    if (a && b) return { start: a.start, end: b.end, preset: p };
    return { start: todayStart, end: tomorrowStart, preset: "hoje" };
  }
  if (p === "ontem") return { start: new Date(todayStart.getTime() - 86_400_000), end: todayStart, preset: p };
  if (p === "semana") return { start: new Date(todayStart.getTime() - 6 * 86_400_000), end: tomorrowStart, preset: p };
  if (p === "mes") return { start: new Date(todayStart.getTime() - 29 * 86_400_000), end: tomorrowStart, preset: p };
  if (p === "ano") return { start: new Date(todayStart.getTime() - 364 * 86_400_000), end: tomorrowStart, preset: p };
  return { start: todayStart, end: tomorrowStart, preset: "hoje" };
}

export interface DashboardData {
  salesTotal: { amount: number; count: number };
  ticketMedio: number | null;
  pixConversion: { generated: number; paid: number };
  funnel: { criados: number; comDados: number; comEndereco: number; chegaramPagamento: number; pagaram: number };
  paymentMethods: { method: string; count: number; amount: number }[];
  installments: { installments: number; count: number }[];
  bump: { count: number; amount: number };
  byState: { state: string; count: number; amount: number }[];
  abandonedCarts: { count: number; recovered: number };
  cancelledOrders: number;
  topProducts: { sku: string; count: number }[];
}

export async function getDashboardData(range: { start: Date; end: Date }): Promise<DashboardData> {
  const { start, end } = range;
  const paidDate = sql`coalesce(${orders.paidAt}, ${orders.createdAt})`;
  const paidCond = and(eq(orders.paymentStatus, "paid"), gte(paidDate, start), lt(paidDate, end))! as SQL;

  const [salesRow] = await db.select({ amount: sql<string>`coalesce(sum(${orders.amountTotal}), 0)`, qty: count() }).from(orders).where(paidCond);
  const salesTotal = { amount: Number(salesRow.amount), count: salesRow.qty };
  const ticketMedio = salesTotal.count > 0 ? salesTotal.amount / salesTotal.count : null;

  const paymentMethodRows = await db
    .select({ method: orders.paymentMethod, count: count(), amount: sql<string>`coalesce(sum(${orders.amountTotal}), 0)` })
    .from(orders)
    .where(paidCond)
    .groupBy(orders.paymentMethod);
  const paymentMethods = paymentMethodRows.map((r) => ({ method: r.method ?? "—", count: r.count, amount: Number(r.amount) }));

  const installmentsRows = await db
    .select({ installments: orders.installments, count: count() })
    .from(orders)
    .where(and(paidCond, eq(orders.paymentMethod, "card")));
  const byInstallments = new Map<number, number>();
  for (const r of installmentsRows) {
    const n = r.installments ?? 1;
    byInstallments.set(n, (byInstallments.get(n) ?? 0) + r.count);
  }
  const installments = [...byInstallments.entries()].sort((a, b) => a[0] - b[0]).map(([installments, count]) => ({ installments, count }));

  const [bumpRow] = await db
    .select({ count: count(), amount: sql<string>`coalesce(sum(${orders.amountTotal}), 0)` })
    .from(orders)
    .innerJoin(checkoutCarts, eq(checkoutCarts.id, orders.cartId))
    .where(and(paidCond, eq(checkoutCarts.bumpAccepted, true)));
  const bump = { count: bumpRow.count, amount: Number(bumpRow.amount) };

  const byStateRows = await db
    .select({ state: orders.addressState, count: count(), amount: sql<string>`coalesce(sum(${orders.amountTotal}), 0)` })
    .from(orders)
    .where(paidCond)
    .groupBy(orders.addressState)
    .orderBy(desc(count()));
  const byState = byStateRows.map((r) => ({ state: r.state ?? "—", count: r.count, amount: Number(r.amount) }));

  const [{ value: cancelledOrders }] = await db
    .select({ value: count() })
    .from(orders)
    .where(and(eq(orders.status, "cancelled"), gte(orders.createdAt, start), lt(orders.createdAt, end)));

  const topProductsRows = await db
    .select({ sku: sql<string>`coalesce(${orders.items}->0->>'sku', ${orders.items}->0->>'name', '—')`, count: count() })
    .from(orders)
    .where(paidCond)
    .groupBy(sql`coalesce(${orders.items}->0->>'sku', ${orders.items}->0->>'name', '—')`)
    .orderBy(desc(count()))
    .limit(10);
  const topProducts = topProductsRows.map((r) => ({ sku: r.sku, count: r.count }));

  const cartCreatedCond = and(gte(checkoutCarts.createdAt, start), lt(checkoutCarts.createdAt, end))! as SQL;
  async function cartCount(extra?: SQL) {
    const cond = extra ? and(cartCreatedCond, extra) : cartCreatedCond;
    const [{ value }] = await db.select({ value: count() }).from(checkoutCarts).where(cond);
    return value;
  }
  const [criadosValue, comDados, comEndereco, chegaramPagamento, pagaram, abandoned, recovered] = await Promise.all([
    cartCount(),
    cartCount(isNotNull(checkoutCarts.customerEmail)!),
    cartCount(isNotNull(checkoutCarts.addressPostalCode)!),
    cartCount(inArray(checkoutCarts.step, ["pagamento", "concluido"])),
    cartCount(inArray(checkoutCarts.status, ["converted", "recovered"])),
    cartCount(eq(checkoutCarts.status, "abandoned")),
    cartCount(eq(checkoutCarts.status, "recovered")),
  ]);

  const pixGeneratedCond = and(eq(paymentAttempts.method, "pix"), gte(paymentAttempts.createdAt, start), lt(paymentAttempts.createdAt, end))!;
  const [{ value: pixGenerated }] = await db.select({ value: count() }).from(paymentAttempts).where(pixGeneratedCond);
  const [{ value: pixPaid }] = await db
    .select({ value: count() })
    .from(paymentAttempts)
    .where(and(pixGeneratedCond, eq(paymentAttempts.status, "paid")));

  return {
    salesTotal,
    ticketMedio,
    pixConversion: { generated: pixGenerated, paid: pixPaid },
    funnel: { criados: criadosValue, comDados, comEndereco, chegaramPagamento, pagaram },
    paymentMethods,
    installments,
    bump,
    byState,
    abandonedCarts: { count: abandoned, recovered },
    cancelledOrders,
    topProducts,
  };
}

// ---------- Carrinhos abandonados (11.5) ----------

export interface CartFilters {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
}

const CART_STATUSES: CheckoutCart["status"][] = ["open", "abandoned", "recovered", "converted"];
export const isCartStatus = (v: string): v is CheckoutCart["status"] => (CART_STATUSES as string[]).includes(v);

export async function listAbandonedCarts(f: CartFilters): Promise<{ rows: CheckoutCart[]; total: number; page: number; pages: number }> {
  const where: SQL[] = [];
  if (f.status && isCartStatus(f.status)) where.push(eq(checkoutCarts.status, f.status));
  const q = (f.q ?? "").trim().slice(0, 100);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    where.push(or(ilike(checkoutCarts.customerName, like), ilike(checkoutCarts.customerEmail, like), ilike(checkoutCarts.customerPhone, like))!);
  }
  const from = f.from ? dayBounds(f.from) : null;
  const to = f.to ? dayBounds(f.to) : null;
  if (from) where.push(gte(checkoutCarts.createdAt, from.start));
  if (to) where.push(lt(checkoutCarts.createdAt, to.end));

  const cond = where.length ? and(...where) : undefined;
  const [{ value: total }] = await db.select({ value: count() }).from(checkoutCarts).where(cond);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, f.page ?? 1));
  const rows = await db.query.checkoutCarts.findMany({
    where: cond,
    orderBy: [desc(checkoutCarts.lastActivityAt)],
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  return { rows, total, page, pages };
}

// ---------- Clientes (11.6) ----------

export interface CustomerRow {
  email: string;
  name: string | null;
  phone: string | null;
  firstActivityAt: Date;
  paidOrders: number;
  totalSpent: number;
}

/**
 * Agrupamento por e-mail sobre orders + checkout_carts (sem tabela nova). Feito em memória: o volume
 * de clientes desta loja não justifica uma consulta SQL com union mais complexa.
 */
export async function listCustomers(f: { q?: string; page?: number }): Promise<{ rows: CustomerRow[]; total: number; page: number; pages: number }> {
  const orderRows = await db
    .select({
      email: orders.customerEmail,
      name: orders.customerName,
      phone: orders.customerPhone,
      createdAt: orders.createdAt,
      paid: sql<boolean>`(${orders.paymentStatus} = 'paid')`,
      amount: orders.amountTotal,
    })
    .from(orders)
    .where(isNotNull(orders.customerEmail));

  const cartRows = await db
    .select({ email: checkoutCarts.customerEmail, name: checkoutCarts.customerName, phone: checkoutCarts.customerPhone, createdAt: checkoutCarts.createdAt })
    .from(checkoutCarts)
    .where(isNotNull(checkoutCarts.customerEmail));

  const byEmail = new Map<string, CustomerRow>();
  const touch = (email: string, name: string | null, phone: string | null, createdAt: Date) => {
    const key = email.toLowerCase();
    const existing = byEmail.get(key);
    if (!existing) {
      byEmail.set(key, { email: key, name, phone, firstActivityAt: createdAt, paidOrders: 0, totalSpent: 0 });
      return;
    }
    if (createdAt < existing.firstActivityAt) existing.firstActivityAt = createdAt;
    if (!existing.name && name) existing.name = name;
    if (!existing.phone && phone) existing.phone = phone;
  };

  for (const r of cartRows) if (r.email) touch(r.email, r.name, r.phone, r.createdAt);
  for (const r of orderRows) {
    if (!r.email) continue;
    touch(r.email, r.name, r.phone, r.createdAt);
    const row = byEmail.get(r.email.toLowerCase())!;
    if (r.paid) {
      row.paidOrders += 1;
      row.totalSpent += Number(r.amount ?? 0);
    }
  }

  let all = [...byEmail.values()].sort((a, b) => b.firstActivityAt.getTime() - a.firstActivityAt.getTime());
  const q = (f.q ?? "").trim().toLowerCase();
  if (q) all = all.filter((c) => c.email.includes(q) || (c.name ?? "").toLowerCase().includes(q) || (c.phone ?? "").includes(q));

  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, f.page ?? 1));
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { rows, total, page, pages };
}

export async function customerFilterEmail(email: string): Promise<Order[]> {
  return db.query.orders.findMany({ where: eq(orders.customerEmail, email.toLowerCase()), orderBy: [desc(orders.createdAt)], limit: 200 });
}
