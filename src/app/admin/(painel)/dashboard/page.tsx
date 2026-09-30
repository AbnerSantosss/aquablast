import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronRight, CreditCard, Eye, FileText, Funnel, Info, ShoppingBag, ShoppingCart, Users, type LucideIcon } from "lucide-react";
import { OperationFunnelChart } from "@/components/admin/dashboard/OperationFunnelChart";
import { requireAdmin } from "@/lib/auth/session";
import { firstParam, formatBRL, formatDateTime, qs } from "@/lib/admin/format";
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

/** Colunas verticais dos funis (checkout e operação). `sub` = % sobre a etapa anterior. */
function Columns({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="cols-chart" style={{ "--n": rows.length } as CSSProperties}>
      {rows.map((r) => (
        <li key={r.label}>
          <span className="cols-value">{r.value}</span>
          <span className="cols-track" aria-hidden="true">
            <span
              className="cols-bar"
              style={{ "--v": `${Math.max(3, (r.value / max) * 100)}%` } as CSSProperties}
            />
          </span>
          <span className="cols-label">
            {r.label}
            {r.sub ? <span className="cols-sub">{r.sub}</span> : null}
          </span>
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
            <span className="rank-label" title={r.sub ? `${r.label} ${r.sub}` : r.label}>
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

interface OpStage {
  id: string;
  label: string;
  value: number;
  /** Complemento do "% …" do card: "dos visitantes", "dos que viram"… */
  of: string;
  desc: string;
  Icon: LucideIcon;
}

/**
 * Funil da operação no layout pedido pelo dono (imagem de 2026-09-30): um card por etapa, a pílula
 * entre eles com quanto passou da anterior, e embaixo o desenho do funil (nivo) alinhado às etapas.
 * A pílula da maior queda fica vermelha; sem ninguém na etapa anterior, "–".
 */
function OperationFunnel({ stages }: { stages: OpStage[] }) {
  const rates = stages.map((s, i) => (i === 0 || stages[i - 1].value <= 0 ? null : s.value / stages[i - 1].value));
  const drops = rates.filter((r): r is number => r !== null && r < 1);
  const worst = drops.length ? Math.min(...drops) : null;
  const hasData = stages.some((s) => s.value > 0);
  return (
    <>
      <ol className="op-steps">
        {stages.map((s, i) => {
          const r = rates[i];
          const tone = i === 0 ? "" : r === null ? "is-empty" : r === worst ? "is-drop" : "";
          const first = i === 0;
          const last = i === stages.length - 1;
          return (
            <li key={s.id} className={`op-step${first ? " is-first" : ""}${last ? " is-last" : ""}`}>
              {first ? null : (
                <span className={`op-rate ${tone}`} title={`${s.label}: quanto passou da etapa anterior`}>
                  {r === null ? "–" : pct(s.value, stages[i - 1].value)}
                  <ArrowRight size={12} strokeWidth={2.6} aria-hidden="true" />
                </span>
              )}
              <div className="op-step-card">
                <span className="op-step-icon" aria-hidden="true">
                  <s.Icon size={20} strokeWidth={2.2} />
                </span>
                <div className="op-step-body">
                  <span className="op-step-label">{s.label}</span>
                  <span className="op-step-value">{s.value}</span>
                  <span className="op-step-sub">
                    {first ? (s.value > 0 ? `100% ${s.of}` : "—") : `${pct(s.value, stages[i - 1].value)} ${s.of}`}
                  </span>
                </div>
              </div>
              <p className="op-step-desc">{s.desc}</p>
            </li>
          );
        })}
      </ol>
      {hasData ? (
        <OperationFunnelChart stages={stages.map(({ id, label, value }) => ({ id, label, value }))} />
      ) : (
        <p className="dash-empty">Sem visitas no período selecionado.</p>
      )}
    </>
  );
}

const METHOD_LABEL: Record<string, string> = { pix: "Pix", card: "Cartão" };

/** AAAA-MM-DD no fuso de São Paulo (o mesmo dos presets do dashboardRange). */
function isoDaySP(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const presetParam = firstParam(sp.preset) || "hoje";
  const from = firstParam(sp.from);
  const to = firstParam(sp.to);
  const range = dashboardRange(presetParam, from, to);
  const data: DashboardData = await getDashboardData(range);

  const linkFor = (preset: string) => `/admin/dashboard${qs({ preset })}`;
  // Datas do período atual (dia de São Paulo) para o seletor do topo: "até" é o último dia incluído.
  const rangeFrom = isoDaySP(range.start);
  const rangeTo = isoDaySP(new Date(range.end.getTime() - 1));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">Vendas, conversão e formas de pagamento do checkout próprio.</p>
        </div>
        {/* Filtro por data (pedido do dono, 2026-09-30): sempre visível no topo, como na imagem de referência. */}
        <form method="get" action="/admin/dashboard" className="dash-range" key={`${rangeFrom}_${rangeTo}`}>
          <input type="hidden" name="preset" value="livre" />
          <CalendarDays size={18} strokeWidth={2.2} aria-hidden="true" />
          <input type="date" name="from" aria-label="De" defaultValue={rangeFrom} max={isoDaySP(new Date())} required />
          <span aria-hidden="true">–</span>
          <input type="date" name="to" aria-label="Até" defaultValue={rangeTo} max={isoDaySP(new Date())} required />
          <button type="submit" aria-label="Aplicar período">
            <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </form>
      </div>

      <div className="tabs">
        {PRESETS.map((p) => (
          <Link key={p.key} className={range.preset === p.key ? "is-active" : ""} href={linkFor(p.key)}>
            {p.label}
          </Link>
        ))}
        <Link
          className={range.preset === "livre" ? "is-active" : ""}
          href={`/admin/dashboard${qs({ preset: "livre", from: from || rangeFrom, to: to || rangeTo })}`}
        >
          Período livre
        </Link>
      </div>

      <section className="dash-card dash-operation">
        <div className="op-head">
          <span className="op-head-icon" aria-hidden="true">
            <Funnel size={20} strokeWidth={2.4} />
          </span>
          <div className="op-head-text">
            <div className="op-title-row">
              <h2>Funil da operação</h2>
              <span className="op-badge">{pct(data.funnel.pagaram, data.traffic.visitantes)} de conversão</span>
            </div>
            <p className="dash-sub">
              Dos visitantes, {pct(data.funnel.pagaram, data.traffic.visitantes)} compraram · {data.traffic.paginas} página(s) vista(s) no site
            </p>
          </div>
          <p className="op-hint">
            <Info size={15} aria-hidden="true" /> Veja em cada etapa quantas pessoas avançam e onde estão as maiores quedas.
          </p>
        </div>
        <OperationFunnel
          stages={[
            { id: "visitantes", label: "Visitantes", value: data.traffic.visitantes, of: "do tráfego", desc: "Pessoas diferentes que acessaram o site.", Icon: Users },
            { id: "produto", label: "Viram o produto", value: data.traffic.viramProduto, of: "dos visitantes", desc: "Abriram a página do produto.", Icon: Eye },
            { id: "checkout", label: "Abriram o checkout", value: data.traffic.abriramCheckout, of: "dos que viram", desc: "Entraram na página do checkout.", Icon: ShoppingCart },
            { id: "dados", label: "Preencheram os dados", value: data.funnel.criados, of: "dos que abriram", desc: "Informaram os dados no checkout.", Icon: FileText },
            { id: "pagamento", label: "Chegaram no pagamento", value: data.funnel.chegaramPagamento, of: "dos que preencheram", desc: "Avançaram para a etapa de pagamento.", Icon: CreditCard },
            { id: "compraram", label: "Compraram", value: data.funnel.pagaram, of: "dos que chegaram", desc: "Pagamento aprovado.", Icon: ShoppingBag },
          ]}
        />
        <p className="dash-note">
          Visitantes são pessoas diferentes (um navegador conta uma vez no período); robôs não entram.
          {data.traffic.desde ? ` Visitas contadas desde ${formatDateTime(data.traffic.desde)}.` : " Nenhuma visita contada ainda."} As
          três últimas etapas contam carrinhos do checkout, como no card &quot;Conversão do checkout&quot;.
        </p>
      </section>

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
          <h2>Top produtos (unidades vendidas)</h2>
          <Rank total={data.salesTotal.count} unit="un." rows={data.topProducts.map((pr) => ({ label: pr.sku, value: pr.count }))} />
        </section>
      </div>
    </>
  );
}
