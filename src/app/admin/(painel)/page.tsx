import type { Metadata } from "next";
import Link from "next/link";
import { PaymentBadge, StatusBadge } from "@/components/admin/Badge";
import { Flash } from "@/components/admin/Flash";
import { Pagination } from "@/components/admin/Pagination";
import { requireAdmin } from "@/lib/auth/session";
import { PAYMENT_LABEL, STATUS_LABEL } from "@/lib/orders/status";
import { firstParam, formatBRL, formatDateTime, formatPhone, qs } from "@/lib/admin/format";
import { getKpis, listOrders } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Pedidos" };

type SP = Record<string, string | string[] | undefined>;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = {
    status: firstParam(sp.status),
    paymentStatus: firstParam(sp.paymentStatus),
    q: firstParam(sp.q),
    from: firstParam(sp.from),
    to: firstParam(sp.to),
  };
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const [kpis, list] = await Promise.all([getKpis(), listOrders({ ...filters, page })]);
  const params = { status: filters.status || undefined, paymentStatus: filters.paymentStatus || undefined, q: filters.q || undefined, from: filters.from || undefined, to: filters.to || undefined };
  const hasFilter = Object.values(params).some(Boolean);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pedidos</h1>
          <p className="sub">Acompanhe pagamentos, envios e entregas.</p>
        </div>
        <div className="actions">
          <Link className="btn btn-primary" href="/admin/pedidos/novo">
            + Pedido manual
          </Link>
        </div>
      </div>

      <Flash ok={firstParam(sp.ok) || undefined} erro={firstParam(sp.erro) || undefined} />

      <div className="kpis">
        <Link className="kpi" href="/admin">
          <span className="kpi-label">Hoje</span>
          <span className="kpi-value">{kpis.today}</span>
        </Link>
        <Link className="kpi" href={`/admin${qs({ paymentStatus: "pending" })}`}>
          <span className="kpi-label">Aguardando pagamento</span>
          <span className="kpi-value">{kpis.awaitingPayment}</span>
        </Link>
        <Link className="kpi" href={`/admin${qs({ paymentStatus: "paid" })}`}>
          <span className="kpi-label">Pagos</span>
          <span className="kpi-value">{kpis.paid}</span>
        </Link>
        <Link className="kpi" href={`/admin${qs({ status: "shipped" })}`}>
          <span className="kpi-label">Enviados</span>
          <span className="kpi-value">{kpis.shipped}</span>
        </Link>
        <Link className="kpi" href={`/admin${qs({ status: "delivered" })}`}>
          <span className="kpi-label">Entregues</span>
          <span className="kpi-value">{kpis.delivered}</span>
        </Link>
        <Link className={`kpi ${kpis.pixLate > 0 ? "is-alert" : ""}`} href={`/admin${qs({ paymentStatus: "pending" })}`} title="Pedidos Pix pendentes há mais tempo que o limite do lembrete">
          <span className="kpi-label">Pix pendentes &gt; {kpis.pixLateMinutes} min</span>
          <span className="kpi-value">{kpis.pixLate}</span>
        </Link>
      </div>

      <form method="get" action="/admin" className="card filters">
        <div className="form-row">
          <label className="field grow">
            <span>Buscar</span>
            <input name="q" defaultValue={filters.q} placeholder="nº do pedido, nome, e-mail, telefone ou rastreio" maxLength={100} />
          </label>
          <label className="field">
            <span>Status</span>
            <select name="status" defaultValue={filters.status}>
              <option value="">Todos</option>
              {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Pagamento</span>
            <select name="paymentStatus" defaultValue={filters.paymentStatus}>
              <option value="">Todos</option>
              {(Object.keys(PAYMENT_LABEL) as (keyof typeof PAYMENT_LABEL)[]).map((k) => (
                <option key={k} value={k}>
                  {PAYMENT_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>De</span>
            <input type="date" name="from" defaultValue={filters.from} />
          </label>
          <label className="field">
            <span>Até</span>
            <input type="date" name="to" defaultValue={filters.to} />
          </label>
          <div className="btn-row">
            <button type="submit" className="btn btn-blue">
              Filtrar
            </button>
            {hasFilter ? (
              <Link className="btn btn-ghost" href="/admin">
                Limpar
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Status</th>
                <th>Pagamento</th>
                <th className="num">Total</th>
                <th>Rastreio</th>
                <th>Criado</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    Nenhum pedido encontrado.
                  </td>
                </tr>
              ) : (
                list.rows.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/admin/pedidos/${o.id}`}>
                        <strong>{o.orderNumber}</strong>
                      </Link>
                      <span className="cell-sub">{o.checkoutProvider}{o.paymentMethod ? ` · ${o.paymentMethod}` : ""}</span>
                    </td>
                    <td>
                      {o.customerName ?? "—"}
                      <span className="cell-sub">{o.customerEmail ?? formatPhone(o.customerPhone)}</span>
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td>
                      <PaymentBadge status={o.paymentStatus} />
                    </td>
                    <td className="num">{formatBRL(o.amountTotal)}</td>
                    <td className="mono">{o.trackingCode ?? "—"}</td>
                    <td className="nowrap">{formatDateTime(o.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pages={list.pages} total={list.total} base="/admin" params={params} />
      </div>
    </>
  );
}
