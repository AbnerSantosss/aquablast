import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { firstParam, formatBRL, qs } from "@/lib/admin/format";
import { dashboardRange, getDashboardData, type DashboardData } from "@/lib/admin/queries-checkout";

export const metadata: Metadata = { title: "Dashboard" };

type SP = Record<string, string | string[] | undefined>;

const PRESETS = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
  { key: "ano", label: "Este ano" },
] as const;

function Bars({ rows, total }: { rows: { label: string; value: number; sub?: string }[]; total: number }) {
  if (rows.length === 0) return <p className="sub">Sem dados no período selecionado.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bar-chart">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bar-label">{r.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          <span className="bar-value">
            {r.value}
            {r.sub ? ` · ${r.sub}` : ""}
            {total > 0 ? ` (${Math.round((r.value / total) * 100)}%)` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function pct(a: number, b: number): string {
  if (b <= 0) return "—";
  return `${Math.round((a / b) * 100)}%`;
}

const METHOD_LABEL: Record<string, string> = { pix: "Pix", card: "Cartão" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const presetParam = firstParam(sp.preset) || "hoje";
  const from = firstParam(sp.from);
  const to = firstParam(sp.to);
  const range = dashboardRange(presetParam, from, to);
  const data: DashboardData = await getDashboardData(range);

  const linkFor = (preset: string) => `/admin/dashboard${qs({ preset })}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">Vendas, conversão e formas de pagamento do checkout próprio.</p>
        </div>
      </div>

      <div className="tabs">
        {PRESETS.map((p) => (
          <Link key={p.key} className={range.preset === p.key ? "is-active" : ""} href={linkFor(p.key)}>
            {p.label}
          </Link>
        ))}
        <Link className={range.preset === "livre" ? "is-active" : ""} href={linkFor("livre")}>
          Período livre
        </Link>
      </div>

      {range.preset === "livre" ? (
        <form method="get" action="/admin/dashboard" className="card filters">
          <div className="form-row">
            <input type="hidden" name="preset" value="livre" />
            <label className="field">
              <span>De</span>
              <input type="date" name="from" defaultValue={from} />
            </label>
            <label className="field">
              <span>Até</span>
              <input type="date" name="to" defaultValue={to} />
            </label>
            <div className="btn-row">
              <button type="submit" className="btn btn-blue">
                Aplicar
              </button>
            </div>
          </div>
        </form>
      ) : null}

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">Vendas totais</span>
          <span className="kpi-value">{formatBRL(data.salesTotal.amount)}</span>
          <span className="cell-sub">{data.salesTotal.count} pedido(s) pago(s)</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Ticket médio</span>
          <span className="kpi-value">{data.ticketMedio === null ? "—" : formatBRL(data.ticketMedio)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Conversão de Pix</span>
          <span className="kpi-value">{pct(data.pixConversion.paid, data.pixConversion.generated)}</span>
          <span className="cell-sub">
            {data.pixConversion.paid} pago(s) de {data.pixConversion.generated} gerado(s)
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Carrinhos abandonados</span>
          <span className="kpi-value">{data.abandonedCarts.count}</span>
          <span className="cell-sub">{data.abandonedCarts.recovered} recuperado(s) por lembrete</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Pedidos cancelados</span>
          <span className="kpi-value">{data.cancelledOrders}</span>
        </div>
      </div>

      <div className="cols-2">
        <div className="card">
          <div className="card-head">
            <h2>Conversão do checkout</h2>
          </div>
          <Bars
            total={data.funnel.criados}
            rows={[
              { label: "Iniciaram o checkout", value: data.funnel.criados },
              { label: "Preencheram dados", value: data.funnel.comDados },
              { label: "Preencheram endereço", value: data.funnel.comEndereco },
              { label: "Chegaram no pagamento", value: data.funnel.chegaramPagamento },
              { label: "Pagaram", value: data.funnel.pagaram },
            ]}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Formas de pagamento</h2>
          </div>
          <Bars
            total={data.salesTotal.count}
            rows={data.paymentMethods.map((m) => ({ label: METHOD_LABEL[m.method] ?? m.method, value: m.count, sub: formatBRL(m.amount) }))}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Parcelamentos (cartão)</h2>
          </div>
          <Bars
            total={data.installments.reduce((s, i) => s + i.count, 0)}
            rows={data.installments.map((i) => ({ label: `${i.installments}x`, value: i.count }))}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Vendas por order bump</h2>
          </div>
          <p className="sub">
            {data.bump.count > 0
              ? `${data.bump.count} pedido(s) com o item extra aceito, somando ${formatBRL(data.bump.amount)}.`
              : "Sem dados no período selecionado."}
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Vendas por estado</h2>
          </div>
          <Bars total={data.salesTotal.count} rows={data.byState.slice(0, 10).map((s) => ({ label: s.state, value: s.count, sub: formatBRL(s.amount) }))} />
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Top produtos</h2>
          </div>
          <Bars total={data.salesTotal.count} rows={data.topProducts.map((p) => ({ label: p.sku, value: p.count }))} />
        </div>
      </div>
    </>
  );
}
