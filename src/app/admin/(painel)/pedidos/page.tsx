import type { Metadata } from "next";
import Link from "next/link";
import { PaymentBadge, StatusBadge } from "@/components/admin/Badge";
import { Flash } from "@/components/admin/Flash";
import { Pagination } from "@/components/admin/Pagination";
import { requireAdmin } from "@/lib/auth/session";
import { PAYMENT_LABEL, STATUS_LABEL } from "@/lib/orders/status";
import { firstParam, formatBRL, formatDateTime, formatPhone, qs, toInputDate } from "@/lib/admin/format";
import { getKpis, listOrders } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Pedidos" };

type SP = Record<string, string | string[] | undefined>;

const PERIODS = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
  { key: "", label: "Todos" },
] as const;

function periodToRange(period: string): { from?: string; to?: string } {
  const now = new Date();
  const today = toInputDate(now);
  if (period === "hoje") return { from: today, to: today };
  if (period === "ontem") {
    const d = toInputDate(new Date(now.getTime() - 86_400_000));
    return { from: d, to: d };
  }
  if (period === "semana") return { from: toInputDate(new Date(now.getTime() - 6 * 86_400_000)), to: today };
  if (period === "mes") return { from: toInputDate(new Date(now.getTime() - 29 * 86_400_000)), to: today };
  return {};
}

const ORIGIN_LABEL: Record<string, string> = { proprio: "Checkout próprio", manual: "Manual", generic: "Zedy" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const period = firstParam(sp.period);
  const explicitFrom = firstParam(sp.from);
  const explicitTo = firstParam(sp.to);
  const periodRange = period ? periodToRange(period) : {};
  const filters = {
    status: firstParam(sp.status),
    paymentStatus: firstParam(sp.paymentStatus),
    q: firstParam(sp.q),
    from: explicitFrom || periodRange.from || "",
    to: explicitTo || periodRange.to || "",
  };
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const [kpis, list] = await Promise.all([getKpis(), listOrders({ ...filters, page })]);
  const params = {
    status: filters.status || undefined,
    paymentStatus: filters.paymentStatus || undefined,
    q: filters.q || undefined,
    from: explicitFrom || undefined,
    to: explicitTo || undefined,
    period: period || undefined,
  };
  const hasFilter = Object.values(params).some(Boolean);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pedidos</h1>
          <p className="sub">Acompanhe pagamentos, envios e entregas.</p>
        </div>
        <div className="actions">
          <nav className="tabs" aria-label="Período">
            {PERIODS.map((p) => (
              <Link
                key={p.key || "todos"}
                className={period === p.key ? "is-active" : ""}
                href={`/admin/pedidos${qs({ ...params, period: p.key || undefined, from: undefined, to: undefined })}`}
              >
                {p.label}
              </Link>
            ))}
          </nav>
          <Link className="btn btn-primary" href="/admin/pedidos/novo">
            + Pedido manual
          </Link>
        </div>
      </div>

      <Flash ok={firstParam(sp.ok) || undefined} erro={firstParam(sp.erro) || undefined} />

      <div className="kpis kpis-compact">
        <Link className="kpi" href="/admin/pedidos">
          <span className="kpi-label">Hoje</span>
          <span className="kpi-value">{kpis.today}</span>
        </Link>
        <Link className="kpi" href={`/admin/pedidos${qs({ paymentStatus: "pending" })}`}>
          <span className="kpi-label">Aguardando pagamento</span>
          <span className="kpi-value">{kpis.awaitingPayment}</span>
        </Link>
        <Link className="kpi" href={`/admin/pedidos${qs({ paymentStatus: "paid" })}`}>
          <span className="kpi-label">Pagos</span>
          <span className="kpi-value">{kpis.paid}</span>
        </Link>
        <Link className="kpi" href={`/admin/pedidos${qs({ status: "shipped" })}`}>
          <span className="kpi-label">Enviados</span>
          <span className="kpi-value">{kpis.shipped}</span>
        </Link>
        <Link className="kpi" href={`/admin/pedidos${qs({ status: "delivered" })}`}>
          <span className="kpi-label">Entregues</span>
          <span className="kpi-value">{kpis.delivered}</span>
        </Link>
        <Link className={`kpi ${kpis.pixLate > 0 ? "is-alert" : ""}`} href={`/admin/pedidos${qs({ paymentStatus: "pending" })}`} title="Pedidos Pix pendentes há mais tempo que o limite do lembrete">
          <span className="kpi-label">Pix pendentes &gt; {kpis.pixLateMinutes} min</span>
          <span className="kpi-value">{kpis.pixLate}</span>
        </Link>
      </div>

      <form method="get" action="/admin/pedidos" className="card filters">
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
            <input type="date" name="from" defaultValue={explicitFrom} />
          </label>
          <label className="field">
            <span>Até</span>
            <input type="date" name="to" defaultValue={explicitTo} />
          </label>
          <div className="btn-row">
            <button type="submit" className="btn btn-blue">
              Filtrar
            </button>
            {hasFilter ? (
              <Link className="btn btn-ghost" href="/admin/pedidos">
                Limpar
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      <div className="card fill">
        <div className="table-wrap">
          <table className="table table-cards">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Situação</th>
                <th>Forma / origem</th>
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
                    <td className="nowrap tc-top">
                      <Link href={`/admin/pedidos/${o.id}`}>
                        <strong>{o.orderNumber}</strong>
                      </Link>
                    </td>
                    <td className="tc-full">
                      {o.customerName ?? "—"}
                      <span className="cell-sub">{o.customerEmail ?? formatPhone(o.customerPhone)}</span>
                    </td>
                    <td>
                      <span className="badge-stack">
                        <PaymentBadge status={o.paymentStatus} />
                        <StatusBadge status={o.status} />
                      </span>
                    </td>
                    <td className="nowrap tc-meta">
                      {o.paymentMethod === "pix" ? "Pix" : o.paymentMethod === "card" ? `Cartão${o.installments && o.installments > 1 ? ` ${o.installments}x` : ""}` : o.paymentMethod ?? "—"}
                      <span className="cell-sub">{ORIGIN_LABEL[o.checkoutProvider] ?? o.checkoutProvider}</span>
                    </td>
                    <td className="num tc-top tc-end">
                      <strong>{formatBRL(o.amountTotal)}</strong>
                    </td>
                    <td className={`mono${o.trackingCode ? "" : " tc-empty"}`} data-label="Rastreio">
                      {o.trackingCode ?? "—"}
                    </td>
                    <td className="nowrap tc-meta">{formatDateTime(o.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pages={list.pages} total={list.total} base="/admin/pedidos" params={params} />
      </div>
    </>
  );
}
