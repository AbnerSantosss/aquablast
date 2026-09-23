import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { SourceBadge, WebhookBadge } from "@/components/admin/Badge";
import { JsonBlock } from "@/components/admin/JsonBlock";
import { requireAdmin } from "@/lib/auth/session";
import { getOrderById } from "@/lib/orders/service";
import { linkWebhookToOrder } from "@/lib/admin/actions/orders";
import { formatDateTime } from "@/lib/admin/format";
import { getWebhook } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Webhook" };

export default async function WebhookPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const wh = await getWebhook(id);
  if (!wh) notFound();
  const order = wh.orderId ? await getOrderById(wh.orderId) : null;

  return (
    <>
      <div className="crumbs">
        <Link href="/admin/webhooks">← Webhooks</Link>
      </div>
      <div className="page-head">
        <div>
          <h1>
            Webhook <SourceBadge source={wh.source} /> <WebhookBadge status={wh.status} />
          </h1>
          <p className="sub">
            Recebido {formatDateTime(wh.receivedAt)}
            {wh.provider ? ` · ${wh.provider}` : ""}
          </p>
        </div>
      </div>

      <div className="cols-2">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Payload</h2>
            </div>
            <JsonBlock value={wh.payload} summary="JSON recebido" open />
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Cabeçalhos</h2>
            </div>
            <JsonBlock value={wh.headers ?? {}} summary="Headers HTTP" />
          </section>
        </div>
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Processamento</h2>
            </div>
            <dl className="dl">
              <dt>Status</dt>
              <dd>
                <WebhookBadge status={wh.status} />
              </dd>
              <dt>Detalhe</dt>
              <dd>{wh.detail ?? "—"}</dd>
              <dt>Processado</dt>
              <dd>{formatDateTime(wh.processedAt)}</dd>
              <dt>Pedido</dt>
              <dd>{order ? <Link href={`/admin/pedidos/${order.id}`}>{order.orderNumber}</Link> : "não vinculado"}</dd>
              <dt>ID</dt>
              <dd className="mono">{wh.id}</dd>
              <dt>Hash</dt>
              <dd className="mono break">{wh.bodyHash}</dd>
            </dl>
          </section>
          {!order ? (
            <section className="card">
              <div className="card-head">
                <h2>Resolver manualmente</h2>
              </div>
              <ActionForm action={linkWebhookToOrder}>
                <input type="hidden" name="deliveryId" value={wh.id} />
                <label className="field">
                  <span>Vincular a um pedido existente (número do pedido)</span>
                  <input name="orderNumber" placeholder="AQB-…" maxLength={80} required />
                </label>
                <div className="actions tight">
                  <button type="submit" className="btn btn-ghost">
                    Vincular a pedido
                  </button>
                </div>
              </ActionForm>
              {wh.source === "checkout" ? (
                <div className="actions">
                  <Link className="btn btn-blue" href={`/admin/pedidos/novo?webhook=${wh.id}`}>
                    Criar pedido manualmente a partir deste payload
                  </Link>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
