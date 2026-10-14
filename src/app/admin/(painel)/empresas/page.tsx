import "@/app/admin/checkout-admin.css";
import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { DEFAULT_COMPANY_ID, orders, products } from "@/db/schema";
import { ActionForm } from "@/components/admin/ActionForm";
import { createCompany } from "@/lib/admin/actions/companies";
import { requireAdmin } from "@/lib/auth/session";
import { listCompanies } from "@/lib/companies";

export const metadata = { title: "Empresas | Painel AquaBlast" };

export default async function EmpresasPage() {
  await requireAdmin();
  const list = await listCompanies();
  const rows = await Promise.all(
    list.map(async (c) => {
      const [{ value: nProducts }] = await db.select({ value: count() }).from(products).where(eq(products.companyId, c.id));
      const [{ value: nOrders }] = await db.select({ value: count() }).from(orders).where(eq(orders.companyId, c.id));
      return { c, nProducts, nOrders };
    }),
  );

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Empresas</h1>
          <p className="sub">
            Cada empresa tem produtos, checkout e gateway próprios e uma chave de API para integrar outras páginas de venda. O AquaBlast é a empresa padrão.
          </p>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Empresas cadastradas</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Slug</th>
                <th>Situação</th>
                <th>Chave de API</th>
                <th className="num">Produtos</th>
                <th className="num">Pedidos</th>
                <th>Checkout</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, nProducts, nOrders }) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/empresas/${c.id}`}>
                      <strong>{c.name}</strong>
                    </Link>
                    {c.id === DEFAULT_COMPANY_ID ? <span className="cell-sub">Empresa padrão</span> : null}
                  </td>
                  <td className="mono">{c.slug}</td>
                  <td>
                    <span className={`badge tone-${c.active ? "green" : "gray"}`}>{c.active ? "Ativa" : "Inativa"}</span>
                  </td>
                  <td className="mono">{c.apiKeyPrefix ? `${c.apiKeyPrefix}…` : "—"}</td>
                  <td className="num">{nProducts}</td>
                  <td className="num">
                    <Link href={`/admin/pedidos?companyId=${c.id}`}>{nOrders}</Link>
                  </td>
                  <td className="mono">
                    <Link href={`/c/${c.slug}`}>/c/{c.slug}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Nova empresa</h2>
        </div>
        <p className="small muted">
          O slug vai na URL do checkout (<code>/c/slug</code>) e não muda depois. Depois de criar, cadastre os produtos, gere a chave de API e configure o gateway.
        </p>
        <ActionForm action={createCompany}>
          <div className="grid-2">
            <label className="field">
              <span>Nome</span>
              <input name="name" maxLength={80} required placeholder="Loja do João" />
            </label>
            <label className="field">
              <span>Slug</span>
              <input name="slug" maxLength={40} required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="loja-do-joao" autoComplete="off" />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="active" defaultChecked />
            <span>Empresa ativa</span>
          </label>
          <div className="actions">
            <button type="submit" className="btn btn-primary">
              Criar empresa
            </button>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
