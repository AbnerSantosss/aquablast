import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { authenticateCompany, preflightResponse, v1Error, v1Json } from "@/lib/companies/api-auth";
import { errorMessage, log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request): Promise<Response> {
  return preflightResponse(request);
}

/** GET /api/v1/orders/[numero] - só pedidos da empresa dona da chave (de outra empresa = 404). */
export async function GET(request: Request, ctx: { params: Promise<{ numero: string }> }): Promise<Response> {
  try {
    await ensureBootstrap();
    const auth = await authenticateCompany(request);
    if (!auth.ok) return auth.response;
    const { numero } = await ctx.params;
    const orderNumber = decodeURIComponent(numero).trim();
    if (!orderNumber || orderNumber.length > 60) return v1Error(400, "bad_request", "Número de pedido inválido.", auth.origin);

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.companyId, auth.company.id), eq(orders.orderNumber, orderNumber)),
    });
    if (!order) return v1Error(404, "not_found", "Pedido não encontrado.", auth.origin);

    return v1Json(
      {
        order: {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          amountTotal: order.amountTotal,
          currency: order.currency,
          items: order.items,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          createdAt: order.createdAt,
          paidAt: order.paidAt,
          shippedAt: order.shippedAt,
          deliveredAt: order.deliveredAt,
          tracking: { code: order.trackingCode, url: order.trackingUrl, carrier: order.carrierName, lastStatus: order.trackingLastStatus },
        },
      },
      200,
      auth.origin,
    );
  } catch (err) {
    log.error("api v1 orders", { error: errorMessage(err) });
    return v1Error(500, "server_error", "Falha ao consultar o pedido.");
  }
}
