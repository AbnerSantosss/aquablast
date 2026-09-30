import { and, desc, eq, gt, isNotNull, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { orders, type Order } from "@/db/schema";

/**
 * Últimas vendas pagas para o app do painel (/admin/app e o aviso com o app aberto).
 * Sem dados pessoais: número do pedido, hora, produto, valor, forma de pagamento e cidade.
 */
export interface RecentSale {
  id: string;
  orderNumber: string;
  /** ISO 8601 */
  paidAt: string;
  product: string;
  amountCents: number;
  payment: string;
  city: string;
}

function productOf(o: Order): string {
  if (!o.items?.length) return "Pedido";
  return o.items.map((i) => `${i.quantity}× ${i.name}${i.variant ? ` (${i.variant})` : ""}`).join(" + ");
}

function paymentOf(o: Order): string {
  const m = o.paymentMethod ?? "";
  if (m === "pix") return "Pix";
  if (m === "card" || m === "credit_card") return "Cartão";
  if (m === "boleto") return "Boleto";
  return m || "—";
}

export function toRecentSale(o: Order): RecentSale {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    paidAt: (o.paidAt ?? o.createdAt).toISOString(),
    product: productOf(o),
    amountCents: Math.round(Number(o.amountTotal) * 100),
    payment: paymentOf(o),
    city: [o.addressCity, o.addressState].filter(Boolean).join("/"),
  };
}

/** Até 20 vendas pagas, da mais nova para a mais antiga; com `since`, só as pagas depois dele. */
export async function recentSales(since?: Date | null, limit = 20): Promise<RecentSale[]> {
  const conds: SQL[] = [eq(orders.paymentStatus, "paid"), isNotNull(orders.paidAt)];
  if (since) conds.push(gt(orders.paidAt, since));
  const rows = await db
    .select()
    .from(orders)
    .where(and(...conds))
    .orderBy(desc(orders.paidAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows.map(toRecentSale);
}
