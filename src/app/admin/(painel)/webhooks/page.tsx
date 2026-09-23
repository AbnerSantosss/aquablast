import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { SourceBadge, WebhookBadge } from "@/components/admin/Badge";
import { JsonBlock } from "@/components/admin/JsonBlock";
import { Pagination } from "@/components/admin/Pagination";
import { requireAdmin } from "@/lib/auth/session";
import { linkWebhookToOrder } from "@/lib/admin/actions/orders";
import { firstParam, formatDateTime, qs } from "@/lib/admin/format";
import { listWebhooks } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Webhooks" };

const STATUSES: [string, string][] = [
  ["", "Todos"],
  ["processed", "Processados"],
  ["unmapped", "Sem pedido"],
  ["error", "Erros"],
  ["ignored", "Ignorados"],
  ["unauthorized", "Não autorizados"],
  ["received", "Recebidos"],
];

export default async function WebhooksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = firstParam(sp.status);
  const source = firstParam(sp.source);
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const list = await listWebhooks({ status, source, page });
  const params = { status: status || undefined, source: source || undefined };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Webhooks</h1>
          <p className="sub">Tudo que o checkout e a transportadora enviaram. {list.unmapped > 0 ? <strong style={{ color: "var(--orange)" }}>{list.unmapped} sem pedido vinculado.</strong> : null}</p>
        </div>
      </div>

      <div className="tabs">
        {STATUSES.map(([v, label]) => (
          <Link key={v} href={`/admin/webhooks${qs({ ...params, status: v || undefined })}`} className={status === v ? "is-active" : ""}>
            {label}
          </Link>
        ))}
      </div>
      <div className="tabs">
        {[
          ["", "Qualquer origem"],
          ["checkout", "Checkout"],
          ["tracking", "Transportadora"],
        ].map(([v, label]) => (
          <Link key={v} href={`/admin/webhooks${qs({ ...params, source: v || undefined })}`} className={source === v ? "is-active" : ""}>
            {label}
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Recebido</th>
                <th>Origem</th>
                <th>Status</th>
                <th>Pedido</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    Nenhum webhook nesse filtro.
                  </td>
                </tr>
              ) : (
                list.rows.map((w) => (
                  <tr key={w.id}>
                    <td className="nowrap">
                      <Link href={`/admin/webhooks/${w.id}`}>{formatDateTime(w.receivedAt)}</Link>
                    </td>
                    <td>
                      <SourceBadge source={w.source} />
                      {w.provider ? <span className="cell-sub">{w.provider}</span> : null}
                    </td>
                    <td>
                      <WebhookBadge status={w.status} />
                      {w.detail ? <span className="cell-sub">{w.detail}</span> : null}
                    </td>
                    <td>
                      {w.orderId && w.orderNumber ? (
                        <Link href={`/admin/pedidos/${w.orderId}`}>{w.orderNumber}</Link>
                      ) : w.status === "unmapped" ? (
                        <div className="stack" style={{ gap: "0.4rem" }}>
                          <ActionForm action={linkWebhookToOrder} inline>
                            <input type="hidden" name="deliveryId" value={w.id} />
                            <input name="orderNumber" placeholder="Nº do pedido" maxLength={80} required style={{ width: "10rem" }} />
                            <button type="submit" className="btn btn-ghost btn-sm">
                              Vincular
                            </button>
                          </ActionForm>
                          <Link className="btn btn-sm btn-blue" href={`/admin/pedidos/novo?webhook=${w.id}`}>
                            Criar pedido a partir deste payload
                          </Link>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <JsonBlock value={w.payload} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pages={list.pages} total={list.total} base="/admin/webhooks" params={params} />
      </div>
    </>
  );
}
