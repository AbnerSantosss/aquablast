import type { Metadata } from "next";
import Link from "next/link";
import { Tone } from "@/components/admin/Badge";
import { Pagination } from "@/components/admin/Pagination";
import { requireAdmin } from "@/lib/auth/session";
import { firstParam, formatDateTime, qs } from "@/lib/admin/format";
import { getClickReport } from "@/lib/admin/queries-clicks";
import { dashboardRange } from "@/lib/admin/queries-checkout";
import { COLOR_LABELS } from "@/lib/site/constants";
import type { Color } from "@/lib/site/types";

export const metadata: Metadata = { title: "Cliques no Comprar" };

type SP = Record<string, string | string[] | undefined>;

const PRESETS = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "semana", label: "7 dias" },
  { key: "mes", label: "30 dias" },
] as const;

const PACK_LABEL: Record<string, string> = { unit: "1 unidade", kit: "Kit com 2" };
const DEVICE_LABEL: Record<string, string> = { mobile: "Celular", desktop: "Computador" };
const PLACE_LABEL: Record<string, string> = { topo: "Topo da página", ofertas: "Cards de oferta" };

function colorsLabel(colors: string): string {
  return colors
    .split("+")
    .map((c) => COLOR_LABELS[c as Color] ?? c)
    .join(" + ");
}

function pct(a: number, b: number): string {
  return b > 0 ? `${Math.round((a / b) * 100)}%` : "—";
}

/**
 * Cliques no botão Comprar da LP (pedido do dono, 2026-10-02). Mostra quantos clicaram, em qual kit e cores, e
 * quantos chegaram de fato ao checkout. "Seguiu, checkout não abriu" é o número a olhar quando parecer que o
 * botão trava: a pessoa clicou para ir, mas o checkout não registrou abertura daquele navegador em 30 min.
 */
export default async function CliquesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const preset = firstParam(sp.preset) || "hoje";
  const range = dashboardRange(preset);
  const pack = firstParam(sp.pack);
  const device = firstParam(sp.device);
  const r = await getClickReport(range, { pack, device, page: Number(firstParam(sp.page)) || 1 });
  const params = { preset: range.preset, pack: pack || undefined, device: device || undefined };
  const link = (over: Record<string, string | undefined>) => `/admin/cliques${qs({ ...params, ...over })}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cliques no Comprar</h1>
          <p className="sub">Cada toque no botão de compra da página, com o kit e as cores escolhidas.</p>
        </div>
      </div>

      <div className="tabs">
        {PRESETS.map((p) => (
          <Link key={p.key} className={range.preset === p.key ? "is-active" : ""} href={link({ preset: p.key, page: undefined })}>
            {p.label}
          </Link>
        ))}
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">Cliques no Comprar</span>
          <span className="kpi-value">{r.total}</span>
          <span className="cell-sub">{r.people} pessoa(s) diferente(s)</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Chegaram ao checkout</span>
          <span className="kpi-value">{r.peopleReached}</span>
          <span className="cell-sub">{pct(r.peopleReached, r.people)} de quem clicou</span>
        </div>
        <div className={`kpi ${r.wentOnNotReached > 0 ? "is-alert" : ""}`} title="Cliques que seguiram para o checkout, mas o checkout não abriu naquele navegador em até 30 min">
          <span className="kpi-label">Seguiu, checkout não abriu</span>
          <span className="kpi-value">{r.wentOnNotReached}</span>
          <span className="cell-sub">de {r.wentOn} clique(s) que seguiram</span>
        </div>
        <div className="kpi" title="Primeiro toque com a escolha de cor incompleta: o botão só avisou qual cor falta">
          <span className="kpi-label">Só avisou a cor que faltava</span>
          <span className="kpi-value">{r.warnedOnly}</span>
          <span className="cell-sub">Pedidos pagos no período: {r.paidOrders}</span>
        </div>
      </div>

      <div className="cols-2">
        <section className="card">
          <div className="card-head">
            <h2>Por kit, aparelho e lugar</h2>
          </div>
          {r.total === 0 ? (
            <p className="muted small">Nenhum clique no período.</p>
          ) : (
            <ul className="click-split">
              {r.byPack.map((x) => (
                <li key={`p-${x.pack}`}>
                  <span>{PACK_LABEL[x.pack] ?? x.pack}</span>
                  <strong>
                    {x.count} <small className="muted">({pct(x.count, r.total)})</small>
                  </strong>
                </li>
              ))}
              {r.byDevice.map((x) => (
                <li key={`d-${x.device}`}>
                  <span>{DEVICE_LABEL[x.device] ?? x.device}</span>
                  <strong>
                    {x.count} <small className="muted">({pct(x.count, r.total)})</small>
                  </strong>
                </li>
              ))}
              {r.byPlace.map((x) => (
                <li key={`l-${x.place}`}>
                  <span>{PLACE_LABEL[x.place] ?? x.place}</span>
                  <strong>
                    {x.count} <small className="muted">({pct(x.count, r.total)})</small>
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Cores mais escolhidas</h2>
            <p className="small muted">Só cliques que seguiram para o checkout.</p>
          </div>
          {r.byColors.length === 0 ? (
            <p className="muted small">Nenhum clique no período.</p>
          ) : (
            <ul className="click-split">
              {r.byColors.map((x) => (
                <li key={`${x.pack}-${x.colors}`}>
                  <span>
                    {PACK_LABEL[x.pack] ?? x.pack}: {colorsLabel(x.colors)}
                  </span>
                  <strong>{x.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <form method="get" action="/admin/cliques" className="card filters">
        <input type="hidden" name="preset" value={range.preset} />
        <div className="form-row">
          <label className="field">
            <span>Kit</span>
            <select name="pack" defaultValue={pack}>
              <option value="">Todos</option>
              <option value="unit">1 unidade</option>
              <option value="kit">Kit com 2</option>
            </select>
          </label>
          <label className="field">
            <span>Aparelho</span>
            <select name="device" defaultValue={device}>
              <option value="">Todos</option>
              <option value="mobile">Celular</option>
              <option value="desktop">Computador</option>
            </select>
          </label>
          <div className="btn-row">
            <button type="submit" className="btn btn-blue">
              Filtrar
            </button>
            {pack || device ? (
              <Link className="btn btn-ghost" href={`/admin/cliques${qs({ preset: range.preset })}`}>
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
                <th>Quando</th>
                <th>Escolha</th>
                <th>Clique</th>
                <th>Checkout</th>
                <th>Aparelho</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Nenhum clique encontrado.
                  </td>
                </tr>
              ) : (
                r.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="nowrap tc-meta">{formatDateTime(c.createdAt)}</td>
                    <td className="tc-top">
                      {PACK_LABEL[c.pack] ?? c.pack}
                      <span className="cell-sub">
                        {colorsLabel(c.colors)}
                        {c.complete ? "" : " (cor não escolhida)"}
                      </span>
                    </td>
                    <td data-label="Clique">
                      {c.warnedOnly ? <Tone tone="orange">Só avisou a cor</Tone> : <Tone tone="blue">Seguiu</Tone>}
                      <span className="cell-sub">{PLACE_LABEL[c.place] ?? c.place}</span>
                    </td>
                    <td data-label="Checkout">
                      {c.warnedOnly ? <span className="muted">—</span> : c.reached ? <Tone tone="green">Abriu</Tone> : <Tone tone="red">Não abriu</Tone>}
                    </td>
                    <td className="nowrap" data-label="Aparelho">
                      {DEVICE_LABEL[c.device] ?? c.device}
                    </td>
                    <td className="nowrap" data-label="Origem">
                      {c.utmSource ?? <span className="muted">direto</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={r.page} pages={r.pages} total={r.rowsTotal} base="/admin/cliques" params={params} />
      </div>

      <p className="muted small">
        &quot;Chegou ao checkout&quot; = o mesmo navegador abriu a página do checkout até 30 minutos depois do clique. Com o
        checkout no modo Zedy, ninguém aparece como &quot;abriu&quot;, porque a Zedy não avisa este site. Robôs não contam.
        {r.firstClick ? ` Cliques contados desde ${formatDateTime(r.firstClick)}.` : " Nenhum clique contado ainda."}
      </p>
    </>
  );
}
