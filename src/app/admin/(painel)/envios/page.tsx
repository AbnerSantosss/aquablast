import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/Badge";
import { Pagination } from "@/components/admin/Pagination";
import { SlaBadge } from "@/components/admin/SlaBadge";
import type { Order } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { firstParam, formatBRL, formatDateTime } from "@/lib/admin/format";
import { getShipmentCounts, listPendingShipments, listSentShipments, shipmentPaidAt } from "@/lib/admin/queries";
import { getSetting } from "@/lib/settings";
import { CARRIERS } from "@/lib/tracking/provider";
import { ShipFeedbackProvider, ShipForm } from "./ShipForms";
import "@/app/admin/envios-admin.css";

export const metadata: Metadata = { title: "Envios" };

type SP = Record<string, string | string[] | undefined>;

function itemsText(o: Order): string {
  return (o.items ?? []).map((i) => `${i.quantity}× ${i.name}${i.variant ? ` (${i.variant})` : ""}`).join(", ") || "—";
}

export default async function EnviosPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const aba = firstParam(sp.aba) === "enviados" ? "enviados" : "pendentes";
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const [counts, defaultCarrier] = await Promise.all([getShipmentCounts(), getSetting("tracking.17track.defaultCarrier")]);
  const now = new Date();
  const carriers = CARRIERS.map((c) => ({ code: c.code, name: c.name }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Envios</h1>
          <p className="sub">
            Prazo de postagem: {counts.slaDays} {counts.slaDays === 1 ? "dia" : "dias"} após o pagamento (muda em{" "}
            <Link href="/admin/configuracoes">Configurações → Envios</Link>).
          </p>
        </div>
        <div className="actions">
          <nav className="tabs" aria-label="Envios">
            <Link className={aba === "pendentes" ? "is-active" : ""} href="/admin/envios" aria-current={aba === "pendentes" ? "page" : undefined}>
              Pendentes ({counts.pending})
            </Link>
            <Link className={aba === "enviados" ? "is-active" : ""} href="/admin/envios?aba=enviados" aria-current={aba === "enviados" ? "page" : undefined}>
              Enviados
            </Link>
          </nav>
        </div>
      </div>

      {aba === "pendentes" ? <Pending slaDays={counts.slaDays} late={counts.late} now={now} carriers={carriers} defaultCarrier={defaultCarrier} /> : <Sent page={page} />}
    </>
  );
}

async function Pending({
  slaDays,
  late,
  now,
  carriers,
  defaultCarrier,
}: {
  slaDays: number;
  late: number;
  now: Date;
  carriers: { code: number; name: string }[];
  defaultCarrier: number;
}) {
  const { rows, total } = await listPendingShipments();
  return (
    <ShipFeedbackProvider>
      {late > 0 ? (
        <div className="flash is-err" role="alert">
          {late} pedido(s) passaram do prazo de postagem. Cadastre o rastreio para avisar o cliente.
        </div>
      ) : null}
      <div className="card fill">
        <div className="table-wrap">
          <table className="table table-cards ship-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Cor / itens</th>
                <th>Pago em</th>
                <th>Prazo</th>
                <th>Rastreio</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Nenhum pedido pago esperando postagem.
                  </td>
                </tr>
              ) : (
                rows.map((o) => {
                  const paidAt = shipmentPaidAt(o);
                  return (
                    <tr key={o.id} data-order={o.orderNumber}>
                      <td className="nowrap tc-top">
                        <Link href={`/admin/pedidos/${o.id}`}>
                          <strong>{o.orderNumber}</strong>
                        </Link>
                        <span className="cell-sub">{formatBRL(o.amountTotal)}</span>
                      </td>
                      <td className="tc-full">
                        {o.customerName ?? "—"}
                        <span className="cell-sub">{o.customerEmail ?? "sem e-mail"}</span>
                      </td>
                      <td className="ship-items" data-label="Cor / itens">
                        {itemsText(o)}
                      </td>
                      <td className="nowrap tc-meta">{formatDateTime(paidAt)}</td>
                      <td className="nowrap tc-top tc-end">
                        <SlaBadge paidAt={paidAt} slaDays={slaDays} now={now} />
                      </td>
                      <td className="ship-cell tc-full">
                        <ShipForm orderId={o.id} orderNumber={o.orderNumber} carriers={carriers} defaultCarrier={defaultCarrier} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          {total} pedido(s) pendente(s){total > rows.length ? ` · mostrando os ${rows.length} mais antigos` : ""}. Salvar o código muda o pedido para
          &quot;Enviado&quot; e manda ao cliente o e-mail com o link de rastreio.
        </p>
      </div>
    </ShipFeedbackProvider>
  );
}

async function Sent({ page }: { page: number }) {
  const list = await listSentShipments({ page });
  return (
    <div className="card fill">
      <div className="table-wrap">
        <table className="table table-cards">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Código</th>
              <th>Transportadora</th>
              <th>Envio</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  Nenhum pedido com código de rastreio ainda.
                </td>
              </tr>
            ) : (
              list.rows.map((o) => (
                <tr key={o.id} data-order={o.orderNumber}>
                  <td className="nowrap tc-top">
                    <Link href={`/admin/pedidos/${o.id}`}>
                      <strong>{o.orderNumber}</strong>
                    </Link>
                  </td>
                  <td className="tc-full">{o.customerName ?? "—"}</td>
                  <td className="mono" data-label="Código">
                    {o.trackingUrl ? (
                      <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer">
                        {o.trackingCode}
                      </a>
                    ) : (
                      o.trackingCode
                    )}
                  </td>
                  <td data-label="Transportadora">{o.carrierName ?? "—"}</td>
                  <td className="nowrap tc-meta">{formatDateTime(o.shippedAt)}</td>
                  <td className="tc-top tc-end">
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={list.page} pages={list.pages} total={list.total} base="/admin/envios" params={{ aba: "enviados" }} />
    </div>
  );
}
