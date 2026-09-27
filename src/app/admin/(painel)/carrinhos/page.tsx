import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Flash } from "@/components/admin/Flash";
import { Pagination } from "@/components/admin/Pagination";
import { Tone } from "@/components/admin/Badge";
import { requireAdmin } from "@/lib/auth/session";
import { firstParam, formatBRL, formatDateTime, formatPhone, whatsappLink } from "@/lib/admin/format";
import { sendReminderNow } from "@/lib/admin/actions/carts";
import { CART_STATUS_LABEL, CART_STEP_LABEL, listAbandonedCarts } from "@/lib/admin/queries-checkout";

export const metadata: Metadata = { title: "Carrinhos abandonados" };

type SP = Record<string, string | string[] | undefined>;

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
  const list = await listAbandonedCarts({ ...filters, page });
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

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Criado em</th>
                <th>Cliente</th>
                <th>Abandonou na</th>
                <th className="num">Valor</th>
                <th>E-mails enviados</th>
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
                  const wa = whatsappLink(c.customerPhone, "Olá! Vi que você não terminou sua compra na AquaBlast, posso ajudar?");
                  const canRemind = !!c.customerEmail && !c.unsubscribedAt && c.status !== "converted" && c.status !== "recovered" && c.recoveryEmailCount < 3;
                  return (
                    <tr key={c.id}>
                      <td className="nowrap">{formatDateTime(c.createdAt)}</td>
                      <td>
                        {c.customerName ?? "—"}
                        <span className="cell-sub">{c.customerEmail ?? formatPhone(c.customerPhone)}</span>
                      </td>
                      <td>{CART_STEP_LABEL[c.step]}</td>
                      <td className="num">{formatBRL(c.amountCents / 100)}</td>
                      <td>{c.recoveryEmailCount} / 3</td>
                      <td>
                        <Tone tone={STATUS_TONE[c.status] ?? "gray"}>{CART_STATUS_LABEL[c.status]}</Tone>
                      </td>
                      <td>
                        <div className="btn-row">
                          {wa ? (
                            <a className="btn btn-sm btn-ghost" href={wa} target="_blank" rel="noopener noreferrer">
                              WhatsApp
                            </a>
                          ) : null}
                          <a className="btn btn-sm btn-ghost" href={`/checkout/pedido/${c.token}`} target="_blank" rel="noopener noreferrer">
                            Abrir carrinho
                          </a>
                          {canRemind ? (
                            <ActionForm action={sendReminderNow} inline confirm={`Enviar lembrete de carrinho agora para ${c.customerEmail}?`}>
                              <input type="hidden" name="cartId" value={c.id} />
                              <button type="submit" className="btn btn-sm btn-blue">
                                Enviar lembrete agora
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
