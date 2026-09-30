import type { Metadata } from "next";
import Link from "next/link";
import { PaymentBadge } from "@/components/admin/Badge";
import { Flash } from "@/components/admin/Flash";
import { SlaBadge } from "@/components/admin/SlaBadge";
import { requireAdmin } from "@/lib/auth/session";
import { firstParam, formatBRL, formatDateTime } from "@/lib/admin/format";
import { getKpis, getShipmentCounts, shipmentPaidAt } from "@/lib/admin/queries";
import { getHomeOrders, getHomeSummary, getPendingSetup } from "@/lib/admin/queries-checkout";

export const metadata: Metadata = { title: "Início" };

type SP = Record<string, string | string[] | undefined>;

export default async function HomePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [summary, kpis, home, pending, ship] = await Promise.all([getHomeSummary(), getKpis(), getHomeOrders(), getPendingSetup(), getShipmentCounts()]);
  const now = new Date();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Início</h1>
          <p className="sub">Resumo do dia e o que precisa de ação. Para o histórico completo, veja Pedidos e o Dashboard.</p>
        </div>
      </div>

      <Flash ok={firstParam(sp.ok) || undefined} erro={firstParam(sp.erro) || undefined} />

      {ship.late > 0 ? (
        <div className="flash is-err" role="alert">
          {ship.late} pedido(s) passaram do prazo de postagem ({ship.slaDays} {ship.slaDays === 1 ? "dia" : "dias"} após o pagamento).{" "}
          <Link href="/admin/envios">Ver pedidos para enviar</Link>
        </div>
      ) : null}

      <div className="kpis">
        <Link className="kpi" href="/admin/pedidos?paymentStatus=paid">
          <span className="kpi-label">Total em vendas hoje</span>
          <span className="kpi-value">{formatBRL(summary.salesTodayAmount)}</span>
          <span className="cell-sub">{summary.salesTodayCount} pedido(s) pago(s)</span>
        </Link>
        <Link className="kpi" href="/admin/pedidos?period=hoje">
          <span className="kpi-label">Pedidos hoje</span>
          <span className="kpi-value">{summary.ordersToday}</span>
        </Link>
        <Link
          className={`kpi ${kpis.pixLate > 0 ? "is-alert" : ""}`}
          href="/admin/pedidos?paymentStatus=pending"
          title="Pedidos com pagamento pendente (Pix gerado e ainda não pago, cartão em análise)"
        >
          <span className="kpi-label">Aguardando pagamento</span>
          <span className="kpi-value">{kpis.awaitingPayment}</span>
          {kpis.pixLate > 0 ? <span className="cell-sub">{kpis.pixLate} Pix há mais de {kpis.pixLateMinutes} min</span> : null}
        </Link>
        <Link className="kpi" href="/admin/carrinhos?status=open">
          <span className="kpi-label">Carrinhos abertos agora</span>
          <span className="kpi-value">{summary.cartsOpenNow}</span>
          <span className="cell-sub">Atividade nos últimos 30 min</span>
        </Link>
      </div>

      <div className="cols-2 home-cols">
        <section className="card">
          <div className="card-head">
            <h2>Para enviar {home.toShipCount > 0 ? <span className="badge tone-orange">{home.toShipCount}</span> : null}</h2>
            <p className="small muted">Pagos sem código de rastreio, do mais antigo para o mais novo.</p>
          </div>
          {home.toShip.length === 0 ? (
            <p className="muted small">Nenhum pedido pago esperando envio.</p>
          ) : (
            <div className="table-wrap">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th className="num">Total</th>
                    <th>Pago em / prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {home.toShip.map((o) => (
                    <tr key={o.id}>
                      <td className="nowrap tc-top">
                        <Link href={`/admin/pedidos/${o.id}`}>
                          <strong>{o.orderNumber}</strong>
                        </Link>
                      </td>
                      <td className="tc-full">{o.customerName ?? "—"}</td>
                      <td className="num tc-top tc-end">{formatBRL(o.amountTotal)}</td>
                      {/* Data em cima, selo embaixo: lado a lado a coluna espremia o nome do cliente em 3 linhas e o Início rolava em 1366x768. */}
                      <td data-label="Pago em">
                        <span className="small muted nowrap">{formatDateTime(shipmentPaidAt(o))}</span>
                        <br />
                        <SlaBadge paidAt={shipmentPaidAt(o)} slaDays={ship.slaDays} now={now} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {home.toShipCount > 0 ? (
            <p className="small home-more">
              <Link href="/admin/envios">{home.toShipCount > home.toShip.length ? `Ver os ${home.toShipCount} pedidos para enviar` : "Abrir Envios e cadastrar o rastreio"}</Link>
            </p>
          ) : null}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Últimos pedidos</h2>
            <Link className="small" href="/admin/pedidos">
              Ver todos
            </Link>
          </div>
          {home.latest.length === 0 ? (
            <p className="muted small">Nenhum pedido ainda.</p>
          ) : (
            <div className="table-wrap">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Pagamento</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {home.latest.map((o) => (
                    <tr key={o.id}>
                      <td className="nowrap tc-top">
                        <Link href={`/admin/pedidos/${o.id}`}>
                          <strong>{o.orderNumber}</strong>
                        </Link>
                        <span className="cell-sub">{o.customerName ?? "—"}</span>
                      </td>
                      <td className="tc-full">
                        <PaymentBadge status={o.paymentStatus} />
                      </td>
                      <td className="num tc-top tc-end">{formatBRL(o.amountTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Falta configurar</h2>
        </div>
        {pending.length === 0 ? (
          <p className="sub">Tudo certo por aqui: gateways, rastreamento e e-mail estão configurados.</p>
        ) : (
          <ul className="checklist">
            {pending.map((item) => (
              <li key={item.label}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
