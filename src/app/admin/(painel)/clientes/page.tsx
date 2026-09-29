import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/admin/Pagination";
import { requireAdmin } from "@/lib/auth/session";
import { firstParam, formatBRL, formatDate, formatPhone } from "@/lib/admin/format";
import { listCustomers } from "@/lib/admin/queries-checkout";

export const metadata: Metadata = { title: "Clientes" };

type SP = Record<string, string | string[] | undefined>;

export default async function ClientesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const list = await listCustomers({ q, page });
  const params = { q: q || undefined };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clientes</h1>
          <p className="sub">Agrupado por e-mail, a partir dos pedidos e dos carrinhos do checkout próprio.</p>
        </div>
      </div>

      <form method="get" action="/admin/clientes" className="card filters">
        <div className="form-row">
          <label className="field grow">
            <span>Buscar</span>
            <input name="q" defaultValue={q} placeholder="nome, e-mail ou telefone" maxLength={100} />
          </label>
          <div className="btn-row">
            <button type="submit" className="btn btn-blue">
              Filtrar
            </button>
            {q ? (
              <Link className="btn btn-ghost" href="/admin/clientes">
                Limpar
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      <div className="card fill">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Primeira atividade</th>
                <th className="num">Pedidos pagos</th>
                <th className="num">Total gasto</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              ) : (
                list.rows.map((c) => (
                  <tr key={c.email}>
                    <td>
                      <Link href={`/admin/pedidos?q=${encodeURIComponent(c.email)}`}>
                        <strong>{c.name ?? c.email}</strong>
                      </Link>
                      <span className="cell-sub">
                        {c.email}
                        {c.phone ? ` · ${formatPhone(c.phone)}` : ""}
                      </span>
                    </td>
                    <td className="nowrap">{formatDate(c.firstActivityAt)}</td>
                    <td className="num">{c.paidOrders}</td>
                    <td className="num">{formatBRL(c.totalSpent)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pages={list.pages} total={list.total} base="/admin/clientes" params={params} />
      </div>
    </>
  );
}
