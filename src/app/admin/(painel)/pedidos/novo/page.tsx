import type { Metadata } from "next";
import Link from "next/link";
import { OrderForm, type OrderFormValues } from "@/components/admin/OrderForm";
import { requireAdmin } from "@/lib/auth/session";
import { normalizeCheckoutPayload } from "@/lib/checkout/normalize";
import { getSetting } from "@/lib/settings";
import { firstParam } from "@/lib/admin/format";
import { getWebhook } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Novo pedido" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const webhookId = firstParam(sp.webhook);
  let initial: OrderFormValues = {};
  let deliveryId: string | undefined;
  let source: string | null = null;

  if (/^[0-9a-f-]{36}$/i.test(webhookId)) {
    const wh = await getWebhook(webhookId);
    if (wh && wh.payload !== null && wh.payload !== undefined) {
      const fieldMap = await getSetting("checkout.fieldMap");
      const n = normalizeCheckoutPayload(wh.payload, fieldMap);
      deliveryId = wh.id;
      source = `webhook ${wh.id.slice(0, 8)} (${wh.provider ?? wh.source})`;
      initial = {
        orderNumber: n.orderNumber ?? "",
        externalId: n.externalId ?? "",
        customerName: n.customer.name ?? "",
        customerEmail: n.customer.email ?? "",
        customerPhone: n.customer.phone ?? "",
        customerDocument: n.customer.document ?? "",
        addressLine1: n.address.line1 ?? "",
        addressLine2: n.address.line2 ?? "",
        addressNeighborhood: n.address.neighborhood ?? "",
        addressCity: n.address.city ?? "",
        addressState: n.address.state ?? "",
        addressPostalCode: n.address.postalCode ?? "",
        addressCountry: n.address.country ?? "",
        items: n.items.map((it) => `${it.quantity}x ${it.name}${it.variant ? ` (${it.variant})` : ""}${it.unitPrice !== null && it.unitPrice !== undefined ? ` | ${it.unitPrice.toFixed(2).replace(".", ",")}` : ""}`).join("\n"),
        amountTotal: n.amountTotal !== null ? n.amountTotal.toFixed(2).replace(".", ",") : "",
        paymentStatus: n.paymentStatus ?? "pending",
        paymentMethod: n.paymentMethod ?? "",
        pixCode: n.pixCode ?? "",
        paymentUrl: n.paymentUrl ?? "",
      };
    }
  }

  return (
    <>
      <div className="crumbs">
        <Link href="/admin">← Pedidos</Link>
      </div>
      <div className="page-head">
        <div>
          <h1>Novo pedido manual</h1>
          <p className="sub">{source ? `Campos pré-preenchidos a partir do ${source}. Revise antes de criar.` : "Para vendas fora do checkout ou webhooks que não foram reconhecidos."}</p>
        </div>
      </div>
      <OrderForm initial={initial} deliveryId={deliveryId} />
    </>
  );
}
