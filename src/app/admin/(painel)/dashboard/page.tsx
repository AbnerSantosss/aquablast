import type { CSSProperties } from "react";
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

/** Todas com 3:1 ou mais contra o branco do card (o laranja da marca dá 2.80:1, por isso o tom escuro).
 *  Cores das séries: marca primeiro. Cada fatia também tem rótulo e valor na legenda (cor não é o único sinal). */
const SERIES = ["#006bca", "#c2410c", "#0e9bbd", "#087e3a", "#6d4bd0", "#063760", "#a16207", "#5d7c94"];

type Row = { label: string; value: number; sub?: string };

/** Pizza ou rosca em SVG puro (sem biblioteca): cada fatia é um traço do mesmo círculo. */
function Donut({ rows, variant, title }: { rows: Row[]; variant: "pie" | "ring"; title: string }) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  if (rows.length === 0 || total <= 0) return <p className="dash-empty">Sem dados no período selecionado.</p>;
  const radius = variant === "pie" ? 25 : 36;
  const stroke = variant === "pie" ? 50 : 22;
  const circ = 2 * Math.PI * radius;
  const gap = rows.length > 1 ? 0.8 : 0;
  const slices = rows.map((r, i) => {
    const before = rows.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    return {
      ...r,
      color: SERIES[i % SERIES.length],
      length: Math.max(0, (r.value / total) * circ - gap),
      offset: -(before / total) * circ,
    };
  });
  const summary = rows.map((r) => `${r.label}: ${r.value} (${Math.round((r.value / total) * 100)}%)`).join(", ");
  return (
    <div className="donut">
      <svg className="donut-svg" viewBox="0 0 100 100" role="img" aria-label={`${title}. ${summary}`}>
        <g transform="rotate(-90 50 50)">
          {slices.map((sl) => (
            <circle
              key={sl.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={sl.color}
              strokeWidth={stroke}
              strokeDasharray={`${sl.length} ${circ}`}
              strokeDashoffset={sl.offset}
            />
          ))}
        </g>
      </svg>
      <ul className="legend">
        {slices.map((sl) => (
          <li key={sl.label}>
            <span className="legend-dot" style={{ background: sl.color }} aria-hidden="true" />
            <span className="legend-label">
              {sl.label}
              <span className="legend-sub">
                {sl.value}
                {sl.sub ? ` · ${sl.sub}` : ""} ({Math.round((sl.value / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Colunas verticais do funil do checkout. */
function Columns({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="cols-chart">
      {rows.map((r, i) => (
        <li key={r.label}>
          <span className="cols-value">{r.value}</span>
          <span className="cols-track" aria-hidden="true">
            <span
              className="cols-bar"
              style={{ "--v": `${Math.max(3, (r.value / max) * 100)}%`, background: SERIES[i % SERIES.length] } as CSSProperties}
            />
          </span>
          <span className="cols-label">{r.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Lista ordenada com barra dentro da linha (estados, produtos). */
function Rank({ rows, total, unit }: { rows: Row[]; total: number; unit?: string }) {
  if (rows.length === 0) return <p className="dash-empty">Sem dados no período selecionado.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="rank">
      {rows.map((r, i) => (
        <li key={r.label}>
          <span className="rank-pos">{i + 1}</span>
          <span className="rank-row">
            <span className="rank-fill" style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} aria-hidden="true" />
            <span className="rank-label">
              {r.label}
              {r.sub ? <span className="rank-sub">{r.sub}</span> : null}
            </span>
            <span className="rank-value">
              {unit ? `${r.value} ${unit}` : total > 0 ? `${r.value} (${Math.round((r.value / total) * 100)}%)` : r.value}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Meter({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className="meter" aria-hidden="true">
      <span className="meter-fill" style={{ width: `${width}%` }} />
    </span>
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

      <div className="dash-grid">
        <section className="dash-card dash-sales">
          <h2>Vendas totais</h2>
          <p className="dash-value">{formatBRL(data.salesTotal.amount)}</p>
          <p className="dash-sub">{data.salesTotal.count} pedido(s) pago(s)</p>
        </section>

        <section className="dash-card dash-ticket">
          <h2>Ticket médio</h2>
          <p className="dash-value">{data.ticketMedio === null ? "—" : formatBRL(data.ticketMedio)}</p>
        </section>

        <section className="dash-card dash-pix">
          <h2>Conversão de Pix</h2>
          <p className="dash-value">{pct(data.pixConversion.paid, data.pixConversion.generated)}</p>
          <p className="dash-sub">
            {data.pixConversion.paid} pago(s) de {data.pixConversion.generated} gerado(s)
          </p>
          <Meter value={data.pixConversion.paid} max={data.pixConversion.generated} />
        </section>

        <section className="dash-card span-2 dash-funnel">
          <h2>Conversão do checkout</h2>
          <p className="dash-value">{pct(data.funnel.pagaram, data.funnel.criados)}</p>
          <Columns
            rows={[
              { label: "Iniciaram o checkout", value: data.funnel.criados },
              { label: "Preencheram dados", value: data.funnel.comDados },
              { label: "Preencheram endereço", value: data.funnel.comEndereco },
              { label: "Chegaram no pagamento", value: data.funnel.chegaramPagamento },
              { label: "Pagaram", value: data.funnel.pagaram },
            ]}
          />
        </section>

        <div className="dash-stack dash-side">
          <section className="dash-card">
            <h2>Carrinhos abandonados</h2>
            <p className="dash-value">{data.abandonedCarts.count}</p>
            <p className="dash-sub">{data.abandonedCarts.recovered} recuperado(s) por lembrete</p>
            <Meter value={data.abandonedCarts.recovered} max={data.abandonedCarts.count} />
          </section>

          <section className="dash-card">
            <h2>Pedidos cancelados</h2>
            <p className="dash-value">{data.cancelledOrders}</p>
          </section>
        </div>

        <section className="dash-card dash-methods">
          <h2>Formas de pagamento</h2>
          <Donut
            variant="pie"
            title="Formas de pagamento"
            rows={data.paymentMethods.map((m) => ({
              label: METHOD_LABEL[m.method] ?? m.method,
              value: m.count,
              sub: formatBRL(m.amount),
            }))}
          />
        </section>

        <section className="dash-card dash-inst">
          <h2>Parcelamentos (cartão)</h2>
          <Donut
            variant="ring"
            title="Parcelamentos (cartão)"
            rows={data.installments.map((i) => ({ label: `${i.installments}x`, value: i.count }))}
          />
        </section>

        <section className="dash-card dash-bump">
          <h2>Vendas por order bump</h2>
          {data.bump.count > 0 ? (
            <>
              <p className="dash-value">{formatBRL(data.bump.amount)}</p>
              <p className="dash-sub">{data.bump.count} pedido(s) com o item extra aceito</p>
            </>
          ) : (
            <p className="dash-empty">Sem dados no período selecionado.</p>
          )}
        </section>

        <section className="dash-card span-2 dash-states">
          <h2>Vendas por estado</h2>
          <Rank
            total={data.salesTotal.count}
            rows={data.byState.slice(0, 10).map((st) => ({ label: st.state, value: st.count, sub: formatBRL(st.amount) }))}
          />
        </section>

        <section className="dash-card dash-top">
          <h2>Top produtos</h2>
          <Rank total={data.salesTotal.count} unit="vendido(s)" rows={data.topProducts.map((pr) => ({ label: pr.sku, value: pr.count }))} />
        </section>
      </div>
    </>
  );
}
