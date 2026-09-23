import type { Metadata } from "next";
import Link from "next/link";
import { EmailStatusBadge } from "@/components/admin/Badge";
import { Pagination } from "@/components/admin/Pagination";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_TEMPLATES } from "@/lib/email/templates";
import { firstParam, formatDateTime } from "@/lib/admin/format";
import { listEmails } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "E-mails" };

export default async function EmailsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = { status: firstParam(sp.status), template: firstParam(sp.template), q: firstParam(sp.q) };
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const list = await listEmails({ ...filters, page });
  const params = { status: filters.status || undefined, template: filters.template || undefined, q: filters.q || undefined };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>E-mails</h1>
          <p className="sub">Histórico de envios (automáticos, manuais e testes).</p>
        </div>
        <div className="actions">
          <Link className="btn btn-blue" href="/admin/emails/templates">
            Editar templates
          </Link>
        </div>
      </div>

      <form method="get" action="/admin/emails" className="card filters">
        <div className="form-row">
          <label className="field grow">
            <span>Buscar</span>
            <input name="q" defaultValue={filters.q} placeholder="destinatário, assunto ou nº do pedido" maxLength={100} />
          </label>
          <label className="field">
            <span>Status</span>
            <select name="status" defaultValue={filters.status}>
              <option value="">Todos</option>
              <option value="sent">Enviados</option>
              <option value="error">Com erro</option>
            </select>
          </label>
          <label className="field">
            <span>Template</span>
            <select name="template" defaultValue={filters.template}>
              <option value="">Todos</option>
              {(Object.keys(DEFAULT_TEMPLATES) as (keyof typeof DEFAULT_TEMPLATES)[]).map((k) => (
                <option key={k} value={k}>
                  {DEFAULT_TEMPLATES[k].name}
                </option>
              ))}
              <option value="test">Teste de configuração</option>
            </select>
          </label>
          <div className="btn-row">
            <button type="submit" className="btn btn-blue">
              Filtrar
            </button>
            {Object.values(params).some(Boolean) ? (
              <Link className="btn btn-ghost" href="/admin/emails">
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
                <th>Quando</th>
                <th>Para</th>
                <th>Assunto</th>
                <th>Template</th>
                <th>Pedido</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Nenhum e-mail encontrado.
                  </td>
                </tr>
              ) : (
                list.rows.map((m) => (
                  <tr key={m.id}>
                    <td className="nowrap">{formatDateTime(m.sentAt)}</td>
                    <td className="break">{m.to}</td>
                    <td>
                      {m.subject}
                      <span className="cell-sub">
                        {m.provider} · {m.triggeredBy}
                      </span>
                      {m.error ? <span className="cell-sub field-error">{m.error}</span> : null}
                    </td>
                    <td className="mono">{m.templateKey ?? "—"}</td>
                    <td>{m.orderId && m.orderNumber ? <Link href={`/admin/pedidos/${m.orderId}`}>{m.orderNumber}</Link> : "—"}</td>
                    <td>
                      <EmailStatusBadge status={m.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pages={list.pages} total={list.total} base="/admin/emails" params={params} />
      </div>
    </>
  );
}
