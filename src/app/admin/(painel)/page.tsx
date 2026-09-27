import type { Metadata } from "next";
import Link from "next/link";
import { Flash } from "@/components/admin/Flash";
import { requireAdmin } from "@/lib/auth/session";
import { firstParam, formatBRL } from "@/lib/admin/format";
import { getHomeSummary, getPendingSetup } from "@/lib/admin/queries-checkout";

export const metadata: Metadata = { title: "Início" };

type SP = Record<string, string | string[] | undefined>;

export default async function HomePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [summary, pending] = await Promise.all([getHomeSummary(), getPendingSetup()]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Início</h1>
          <p className="sub">Resumo do dia. Para o histórico completo, veja Pedidos e o Dashboard.</p>
        </div>
      </div>

      <Flash ok={firstParam(sp.ok) || undefined} erro={firstParam(sp.erro) || undefined} />

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
        <Link className="kpi" href="/admin/carrinhos?status=open">
          <span className="kpi-label">Carrinhos abertos agora</span>
          <span className="kpi-value">{summary.cartsOpenNow}</span>
          <span className="cell-sub">Atividade nos últimos 30 min</span>
        </Link>
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
