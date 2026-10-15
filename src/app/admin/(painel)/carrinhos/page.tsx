import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Flash } from "@/components/admin/Flash";
import { Pagination } from "@/components/admin/Pagination";
import { Tone } from "@/components/admin/Badge";
import { requireAdmin } from "@/lib/auth/session";
import "@/app/admin/checkout-admin.css";
import { firstParam, formatBRL, formatDate, formatDateTime, formatPhone, whatsappLink } from "@/lib/admin/format";
import { env } from "@/lib/env";
import { formatMinutes, nextStepLabel, recoveryWhatsappText } from "@/lib/admin/cart-recovery";
import { sendReminderNow } from "@/lib/admin/actions/carts";
import type { RecoveryPlan } from "@/lib/admin/queries-checkout";
import { CART_STATUS_LABEL, CART_STEP_LABEL, getRecoveryPlan, listAbandonedCarts, recoveryFunnel } from "@/lib/admin/queries-checkout";

export const metadata: Metadata = { title: "Carrinhos abandonados" };

type SP = Record<string, string | string[] | undefined>;

const RULE_TEMPLATES: { key: string; label: string; when: (p: RecoveryPlan) => string }[] = [
  { key: "cart_abandoned_1", label: "1º e-mail", when: (p) => (p.minutes[0] > 0 ? `após ${formatMinutes(p.minutes[0])}` : "desligado") },
  { key: "cart_abandoned_2", label: "2º e-mail", when: (p) => (p.minutes[1] > 0 ? `após ${formatMinutes(p.minutes[1])}` : "desligado") },
  { key: "cart_abandoned_3", label: "3º e-mail", when: (p) => (p.minutes[2] > 0 ? `após ${formatMinutes(p.minutes[2])}` : "desligado") },
  {
    key: "pix_reminder",
    label: "Lembrete de Pix",
    when: (p) => (p.pixAfterMinutes > 0 && p.pixMaxCount > 0 ? `a cada ${formatMinutes(p.pixAfterMinutes)}, até ${p.pixMaxCount} ${p.pixMaxCount === 1 ? "vez" : "vezes"}` : "desligado"),
  },
  { key: "pix_expired", label: "Pix vencido", when: () => "quando o Pix vence" },
  { key: "payment_refused", label: "Pagamento recusado", when: () => "quando o cartão é recusado" },
];

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

const STATUS_TONE: Record<string, "gray" | "blue" | "cyan" | "orange" | "green" | "red"> = {
  open: "blue",
  abandoned: "orange",
  recovered: "green",
  converted: "gray",
};

export default async function CarrinhosPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = {
    status: firstParam(sp.status),
    q: firstParam(sp.q),
    from: firstParam(sp.from),
    to: firstParam(sp.to),
  };
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const [list, funnel, plan] = await Promise.all([listAbandonedCarts({ ...filters, page }), recoveryFunnel({ from: filters.from, to: filters.to }), getRecoveryPlan()]);
  const now = new Date();
  const baseUrl = env().APP_URL;
  const periodo = funnel.isDefaultPeriod
    ? "Últimos 30 dias (sem filtro de datas)."
    : `Carrinhos criados ${funnel.from ? `de ${formatDate(funnel.from)} ` : ""}${funnel.to ? `até ${formatDate(new Date(funnel.to.getTime() - 1))}` : "até hoje"}.`;
  const params = { status: filters.status || undefined, q: filters.q || undefined, from: filters.from || undefined, to: filters.to || undefined };
  const hasFilter = Object.values(params).some(Boolean);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Carrinhos abandonados</h1>
          <p className="sub">Carrinhos do checkout próprio que não terminaram em pedido pago.</p>
        </div>
      </div>

      <Flash ok={firstParam(sp.ok) || undefined} erro={firstParam(sp.erro) || undefined} />

      <section className="card rec-funnel" aria-labelledby="rec-funil-titulo">
        <div className="card-head">
          <h2 id="rec-funil-titulo">Funil de recuperação</h2>
          <p className="muted small">{periodo} Conta os carrinhos criados no período.</p>
        </div>
        <div className="kpis">
          <div className="kpi">
            <span className="kpi-label">Com contato</span>
            <span className="kpi-value">{funnel.comContato}</span>
            <span className="cell-sub">
              {funnel.comEmail} com e-mail · {funnel.soTelefone} só telefone (só WhatsApp)
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Receberam e-mail</span>
            <span className="kpi-value">{funnel.receberam1}</span>
            <span className="cell-sub">
              1º: {funnel.receberam1} · 2º: {funnel.receberam2} · 3º: {funnel.receberam3}
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Recuperados</span>
            <span className="kpi-value">{funnel.recuperados}</span>
            <span className="cell-sub">{formatBRL(funnel.valorRecuperadoCents / 100)} recuperados</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Taxa de recuperação</span>
            <span className="kpi-value">{pct(funnel.taxaRecuperacao)}</span>
            <span className="cell-sub">
              {funnel.recuperados} de {funnel.receberam1} que receberam e-mail
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Compraram direto</span>
            <span className="kpi-value">{funnel.compraramDireto}</span>
            <span className="cell-sub">pagaram sem receber lembrete</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Descadastrados</span>
            <span className="kpi-value">{funnel.descadastrados}</span>
            <span className="cell-sub">pediram para não receber</span>
          </div>
        </div>
      </section>

      <section className="card rec-rule" aria-labelledby="rec-regua-titulo">
        <div className="card-head">
          <h2 id="rec-regua-titulo">Régua atual</h2>
          <div className="btn-row">
            <Tone tone={plan.enabled ? "green" : "gray"}>{plan.enabled ? "Ligada" : "Desligada"}</Tone>
            <Link className="btn btn-sm btn-ghost" href="/admin/checkout#recuperacao">
              Mudar tempos
            </Link>
          </div>
          <p className="muted small">
            Os e-mails contam a partir da última atividade do cliente no carrinho. O tempo do lembrete de Pix muda em{" "}
            <Link href="/admin/configuracoes">Configurações</Link>.
          </p>
        </div>
        <ul className="rec-steps">
          {RULE_TEMPLATES.map((t) => (
            <li key={t.key}>
              <strong>{t.label}</strong>
              <span className="muted">{t.when(plan)}</span>
              <Link className="rec-link" href={`/admin/emails/templates/${t.key}`}>
                Ver modelo
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <form method="get" action="/admin/carrinhos" className="card filters">
        <div className="form-row">
          <label className="field grow">
            <span>Buscar</span>
            <input name="q" defaultValue={filters.q} placeholder="nome, e-mail ou telefone" maxLength={100} />
          </label>
          <label className="field">
            <span>Situação</span>
            <select name="status" defaultValue={filters.status}>
              <option value="">Todos</option>
              {(Object.keys(CART_STATUS_LABEL) as (keyof typeof CART_STATUS_LABEL)[]).map((k) => (
                <option key={k} value={k}>
                  {CART_STATUS_LABEL[k]}
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
              <Link className="btn btn-ghost" href="/admin/carrinhos">
                Limpar
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      <div className="card fill">
        <div className="table-wrap">
          <table className="table table-cards rec-cards">
            <thead>
              <tr>
                <th>Criado em</th>
                <th>Cliente</th>
                <th className="num">Valor</th>
                <th>E-mails</th>
                <th>Próximo passo</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    Nenhum carrinho encontrado.
                  </td>
                </tr>
              ) : (
                list.rows.map((c) => {
                  const open = c.status === "open" || c.status === "abandoned";
                  const wa = open ? whatsappLink(c.customerPhone, recoveryWhatsappText(c, baseUrl)) : null;
                  const canRemind = !!c.customerEmail && !c.unsubscribedAt && c.status !== "converted" && c.status !== "recovered" && c.recoveryEmailCount < 3;
                  return (
                    <tr key={c.id}>
                      <td className="nowrap tc-meta">{formatDateTime(c.createdAt)}</td>
                      <td className="tc-top rec-client">
                        {c.customerName ?? "—"}
                        <span className="cell-sub">{c.customerEmail ?? formatPhone(c.customerPhone)}</span>
                      </td>
                      <td className="num tc-top tc-end">
                        <strong>{formatBRL(c.amountCents / 100)}</strong>
                      </td>
                      <td className="nowrap" data-label="E-mails">
                        {c.recoveryEmailCount} / 3
                      </td>
                      <td className="rec-next" data-label="Próximo passo">{nextStepLabel(c, plan, now)}</td>
                      <td className="rec-status">
                        <Tone tone={STATUS_TONE[c.status] ?? "gray"}>{CART_STATUS_LABEL[c.status]}</Tone>
                        <span className="cell-sub">parou em {CART_STEP_LABEL[c.step]}</span>
                      </td>
                      <td className="tc-full">
                        <div className="btn-row">
                          {wa ? (
                            <a className="btn btn-sm btn-ghost" href={wa} target="_blank" rel="noopener noreferrer">
                              WhatsApp
                            </a>
                          ) : null}
                          <a className="btn btn-sm btn-ghost" href={`/checkout/pedido/${c.token}`} target="_blank" rel="noopener noreferrer" title="Abrir o carrinho do cliente em outra aba">
                            Abrir
                          </a>
                          {canRemind ? (
                            <ActionForm action={sendReminderNow} inline confirm={`Enviar lembrete de carrinho agora para ${c.customerEmail}?`}>
                              <input type="hidden" name="cartId" value={c.id} />
                              <button type="submit" className="btn btn-sm btn-blue">
                                Enviar lembrete
                              </button>
                            </ActionForm>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pages={list.pages} total={list.total} base="/admin/carrinhos" params={params} />
      </div>
    </>
  );
}
