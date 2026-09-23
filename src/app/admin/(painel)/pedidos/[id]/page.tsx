import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { OrderStatus } from "@/db/schema";
import { ActionForm } from "@/components/admin/ActionForm";
import { EmailStatusBadge, PaymentBadge, SourceBadge, StatusBadge, WebhookBadge } from "@/components/admin/Badge";
import { CopyButton } from "@/components/admin/CopyButton";
import { Flash } from "@/components/admin/Flash";
import { JsonBlock } from "@/components/admin/JsonBlock";
import { requireAdmin } from "@/lib/auth/session";
import { activeAccessCodePrefix, getOrderById, getOrderEvents, maskedDocument } from "@/lib/orders/service";
import { PAYMENT_LABEL, STATUS_LABEL, STATUS_ORDER, canTransition } from "@/lib/orders/status";
import { getSettings } from "@/lib/settings";
import { CARRIERS } from "@/lib/tracking/provider";
import { addManualEvent, changeStatus, resendAccessCode, resendPix, saveNotes, sendConfirmation, sendShippedEmail, updatePayment } from "@/lib/admin/actions/orders";
import { clearTracking, saveTracking, syncTrackingNow } from "@/lib/admin/actions/tracking";
import { firstParam, formatBRL, formatCep, formatDateTime, formatPhone, telLink, timeAgo, whatsappLink } from "@/lib/admin/format";
import { listOrderEmails, listOrderWebhooks } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Pedido" };

const ALL_STATUSES = [...STATUS_ORDER, "exception", "cancelled"] as OrderStatus[];

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await getOrderById(id);
  if (!order) notFound();

  const [eventsAsc, emails, webhooks, codePrefix, settings] = await Promise.all([
    getOrderEvents(order.id),
    listOrderEmails(order.id),
    listOrderWebhooks(order.id),
    activeAccessCodePrefix(order.id),
    getSettings(["store.name", "store.trackingPageUrl", "tracking.17track.defaultCarrier", "tracking.provider"] as const),
  ]);
  const events = [...eventsAsc].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const firstName = (order.customerName ?? "").split(/\s+/)[0] || "tudo bem";
  const waText = [
    `Olá, ${firstName}! Aqui é da ${settings["store.name"]}, sobre o seu pedido ${order.orderNumber}.`,
    order.trackingCode ? `Código de rastreio: ${order.trackingCode}${order.trackingUrl ? ` (${order.trackingUrl})` : ""}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const wa = whatsappLink(order.customerPhone, waText);
  const tel = telLink(order.customerPhone);
  const doc = maskedDocument(order.customerDocumentEnc);
  const allowed = ALL_STATUSES.filter((s) => canTransition(order.status, s));
  const defaultCarrier = order.carrierCode ? Number(order.carrierCode) : settings["tracking.17track.defaultCarrier"];
  const address = [
    order.addressLine1,
    order.addressLine2,
    order.addressNeighborhood,
    [order.addressCity, order.addressState].filter(Boolean).join(" / "),
    formatCep(order.addressPostalCode),
    order.addressCountry,
  ].filter(Boolean);
  const timestamps: [string, Date | null][] = [
    ["Criado", order.createdAt],
    ["Pago", order.paidAt],
    ["Aprovado", order.approvedAt],
    ["Em preparação", order.preparingAt],
    ["Enviado", order.shippedAt],
    ["Em trânsito", order.inTransitAt],
    ["Saiu p/ entrega", order.outForDeliveryAt],
    ["Entregue", order.deliveredAt],
    ["Cancelado", order.cancelledAt],
    ["Atualizado", order.updatedAt],
  ];

  return (
    <>
      <div className="crumbs">
        <Link href="/admin">← Pedidos</Link>
      </div>
      <div className="page-head">
        <div>
          <h1>
            Pedido {order.orderNumber} <StatusBadge status={order.status} /> <PaymentBadge status={order.paymentStatus} />
          </h1>
          <p className="sub">
            {order.customerName ?? "Sem nome"} · {formatBRL(order.amountTotal)} · criado {timeAgo(order.createdAt)} ({formatDateTime(order.createdAt)})
          </p>
        </div>
        <div className="actions">
          {wa ? (
            <a className="btn btn-blue" href={wa} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          ) : null}
          {order.customerEmail ? (
            <a className="btn btn-ghost" href={`mailto:${order.customerEmail}`}>
              E-mail
            </a>
          ) : null}
        </div>
      </div>

      <Flash ok={firstParam(sp.ok) || undefined} erro={firstParam(sp.erro) || undefined} />

      <div className="cols-2">
        <div className="stack">
          {/* ---------- Cliente ---------- */}
          <section className="card">
            <div className="card-head">
              <h2>Cliente e entrega</h2>
            </div>
            <dl className="dl">
              <dt>Nome</dt>
              <dd>{order.customerName ?? "—"}</dd>
              <dt>E-mail</dt>
              <dd>{order.customerEmail ? <a href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a> : "—"}</dd>
              <dt>Telefone</dt>
              <dd>
                {order.customerPhone ? (
                  <>
                    {tel ? <a href={tel}>{formatPhone(order.customerPhone)}</a> : formatPhone(order.customerPhone)}
                    {wa ? (
                      <>
                        {" · "}
                        <a href={wa} target="_blank" rel="noopener noreferrer">
                          abrir WhatsApp
                        </a>
                      </>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </dd>
              <dt>CPF</dt>
              <dd>{doc ?? "—"}</dd>
              <dt>Endereço</dt>
              <dd>{address.length ? address.join(", ") : "—"}</dd>
            </dl>

            <h3 className="section-title">Itens</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="num">Qtd</th>
                    <th className="num">Unitário</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">
                        Sem itens registrados.
                      </td>
                    </tr>
                  ) : (
                    order.items.map((it, i) => (
                      <tr key={i}>
                        <td>
                          {it.name}
                          {it.variant ? <span className="cell-sub">{it.variant}</span> : null}
                          {it.sku ? <span className="cell-sub mono">{it.sku}</span> : null}
                        </td>
                        <td className="num">{it.quantity}</td>
                        <td className="num">{formatBRL(it.unitPrice)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={2} className="right">
                      Total
                    </th>
                    <td className="num">
                      <strong>{formatBRL(order.amountTotal)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <h3 className="section-title">Pagamento</h3>
            <dl className="dl">
              <dt>Situação</dt>
              <dd>
                <PaymentBadge status={order.paymentStatus} />
              </dd>
              <dt>Forma</dt>
              <dd>{order.paymentMethod ?? "—"}</dd>
              <dt>Checkout</dt>
              <dd>
                {order.checkoutProvider}
                {order.externalId ? (
                  <>
                    {" · "}
                    <span className="mono">{order.externalId}</span>
                  </>
                ) : null}
              </dd>
              {order.paymentUrl ? (
                <>
                  <dt>Link</dt>
                  <dd className="break">
                    <a href={order.paymentUrl} target="_blank" rel="noopener noreferrer">
                      {order.paymentUrl}
                    </a>
                  </dd>
                </>
              ) : null}
              {order.pixExpiresAt ? (
                <>
                  <dt>Pix expira</dt>
                  <dd>{formatDateTime(order.pixExpiresAt)}</dd>
                </>
              ) : null}
              {order.pixCode ? (
                <>
                  <dt>Pix</dt>
                  <dd>
                    <div className="pix-box">{order.pixCode}</div>
                    <div className="actions tight">
                      <CopyButton value={order.pixCode} label="Copiar Pix copia e cola" small />
                    </div>
                  </dd>
                </>
              ) : null}
            </dl>
            <ActionForm action={updatePayment} inline>
              <input type="hidden" name="orderId" value={order.id} />
              <label className="field">
                <span>Alterar pagamento manualmente</span>
                <select name="paymentStatus" defaultValue={order.paymentStatus}>
                  {(Object.keys(PAYMENT_LABEL) as (keyof typeof PAYMENT_LABEL)[]).map((k) => (
                    <option key={k} value={k}>
                      {PAYMENT_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-ghost btn-sm">
                Aplicar
              </button>
            </ActionForm>

            {order.utm && Object.keys(order.utm).length ? (
              <>
                <h3 className="section-title">Origem (UTM)</h3>
                <dl className="dl">
                  {Object.entries(order.utm).map(([k, v]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <dt>{k}</dt>
                      <dd className="break">{v}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}

            <h3 className="section-title">Datas</h3>
            <dl className="dl">
              {timestamps
                .filter(([, d]) => d)
                .map(([label, d]) => (
                  <div key={label} style={{ display: "contents" }}>
                    <dt>{label}</dt>
                    <dd>{formatDateTime(d)}</dd>
                  </div>
                ))}
            </dl>
          </section>

          {/* ---------- Linha do tempo ---------- */}
          <section className="card">
            <div className="card-head">
              <h2>Linha do tempo</h2>
              <span className="muted small">{events.length} evento(s), mais recente primeiro</span>
            </div>
            {events.length === 0 ? (
              <p className="muted">Nenhum evento ainda.</p>
            ) : (
              <ol className="timeline">
                {events.map((e) => (
                  <li key={e.id}>
                    <div className="tl-head">
                      <span className="tl-title">{e.title}</span>
                      <SourceBadge source={e.source} />
                      {e.status ? <StatusBadge status={e.status} /> : null}
                      <span className="muted small">{formatDateTime(e.occurredAt)}</span>
                    </div>
                    {e.description ? <p className="tl-desc">{e.description}</p> : null}
                  </li>
                ))}
              </ol>
            )}
            <h3 className="section-title">Adicionar evento manual</h3>
            <ActionForm action={addManualEvent}>
              <input type="hidden" name="orderId" value={order.id} />
              <div className="grid-2">
                <label className="field span-2">
                  <span>Título</span>
                  <input name="title" required maxLength={200} placeholder="Ex.: Cliente pediu para entregar no vizinho" />
                </label>
                <label className="field span-2">
                  <span>Descrição (visível para o cliente na página de rastreio)</span>
                  <textarea name="description" rows={2} maxLength={2000} />
                </label>
              </div>
              <div className="actions tight">
                <button type="submit" className="btn btn-ghost">
                  Adicionar à linha do tempo
                </button>
              </div>
            </ActionForm>
          </section>

          {/* ---------- Notas ---------- */}
          <section className="card">
            <div className="card-head">
              <h2>Notas internas</h2>
              <span className="muted small">Só a equipe vê.</span>
            </div>
            <ActionForm action={saveNotes}>
              <input type="hidden" name="orderId" value={order.id} />
              <textarea name="adminNotes" rows={4} defaultValue={order.adminNotes ?? ""} maxLength={10000} />
              <div className="actions tight">
                <button type="submit" className="btn btn-ghost">
                  Salvar notas
                </button>
              </div>
            </ActionForm>
          </section>
        </div>

        <div className="stack">
          {/* ---------- Status ---------- */}
          <section className="card">
            <div className="card-head">
              <h2>Status</h2>
              <StatusBadge status={order.status} />
            </div>
            {allowed.length ? (
              <>
                <p className="muted small" style={{ marginBottom: "0.5rem" }}>
                  Próximos passos permitidos:
                </p>
                <div className="status-grid">
                  {allowed
                    .filter((s) => s !== "cancelled")
                    .map((s) => (
                      <ActionForm key={s} action={changeStatus} inline>
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="to" value={s} />
                        <button type="submit" className={`btn btn-sm ${s === "exception" ? "btn-ghost danger" : "btn-ghost"}`}>
                          {STATUS_LABEL[s]}
                        </button>
                      </ActionForm>
                    ))}
                </div>
              </>
            ) : (
              <p className="muted small">Nenhuma transição automática disponível a partir de “{STATUS_LABEL[order.status]}”. Use “Forçar” abaixo se precisar.</p>
            )}

            <h3 className="section-title">Alterar com detalhes</h3>
            <ActionForm action={changeStatus}>
              <input type="hidden" name="orderId" value={order.id} />
              <div className="grid-2">
                <label className="field span-2">
                  <span>Novo status</span>
                  <select name="to" defaultValue="">
                    <option value="" disabled>
                      Selecione…
                    </option>
                    {ALL_STATUSES.filter((s) => s !== order.status).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                        {canTransition(order.status, s) ? "" : " (só com Forçar)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field span-2">
                  <span>Título do evento (opcional)</span>
                  <input name="title" maxLength={200} placeholder="Padrão do status" />
                </label>
                <label className="field span-2">
                  <span>Descrição (opcional)</span>
                  <textarea name="description" rows={2} maxLength={2000} />
                </label>
              </div>
              <label className="check">
                <input type="checkbox" name="force" />
                <span>Forçar (ignora a ordem normal das etapas; fica registrado na auditoria)</span>
              </label>
              <div className="actions tight">
                <button type="submit" className="btn btn-blue">
                  Aplicar status
                </button>
              </div>
            </ActionForm>

            {order.status !== "cancelled" ? (
              <div className="actions">
                <ActionForm action={changeStatus} inline confirm={`Cancelar o pedido ${order.orderNumber}? O cliente verá "Pedido cancelado" na página de rastreio.`}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="to" value="cancelled" />
                  {order.status === "delivered" ? <input type="hidden" name="force" value="1" /> : null}
                  <button type="submit" className="btn btn-ghost danger btn-sm">
                    Cancelar pedido
                  </button>
                </ActionForm>
              </div>
            ) : null}
          </section>

          {/* ---------- Rastreio ---------- */}
          <section className="card">
            <div className="card-head">
              <h2>Rastreio</h2>
              {order.trackingCode ? (
                <a className="btn btn-sm btn-ghost" href={order.trackingUrl ?? "#"} target="_blank" rel="noopener noreferrer">
                  Abrir na transportadora
                </a>
              ) : null}
            </div>
            {order.trackingCode ? (
              <dl className="dl" style={{ marginBottom: "1rem" }}>
                <dt>Código</dt>
                <dd className="mono">
                  {order.trackingCode} <CopyButton value={order.trackingCode} small />
                </dd>
                <dt>Transportadora</dt>
                <dd>
                  {order.carrierName ?? "—"}
                  {order.carrierCode ? <span className="muted small"> (código {order.carrierCode})</span> : null}
                </dd>
                <dt>Provedor</dt>
                <dd>{order.trackingProvider ?? "—"}</dd>
                <dt>Registrado</dt>
                <dd>{order.trackingRegisteredAt ? formatDateTime(order.trackingRegisteredAt) : "não registrado no provedor"}</dd>
                <dt>Última sync</dt>
                <dd>
                  {order.trackingLastSyncAt ? formatDateTime(order.trackingLastSyncAt) : "—"}
                  {order.trackingLastStatus ? <span className="muted small"> · {order.trackingLastStatus}</span> : null}
                </dd>
                {order.trackingSyncError ? (
                  <>
                    <dt>Erro</dt>
                    <dd className="field-error break">{order.trackingSyncError}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p className="muted small" style={{ marginBottom: "0.75rem" }}>
                Nenhum código cadastrado.
              </p>
            )}
            <ActionForm action={saveTracking}>
              <input type="hidden" name="orderId" value={order.id} />
              <div className="grid-2">
                <label className="field">
                  <span>Código de rastreio</span>
                  <input name="trackingCode" defaultValue={order.trackingCode ?? ""} required maxLength={80} className="mono" placeholder="BR123456789SP" />
                </label>
                <label className="field">
                  <span>Transportadora</span>
                  <select name="carrierCode" defaultValue={String(defaultCarrier)}>
                    {CARRIERS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field span-2">
                  <span>URL de rastreio (opcional, sobrescreve a da transportadora)</span>
                  <input name="trackingUrl" defaultValue={order.trackingUrl ?? ""} maxLength={1000} placeholder="https://…" />
                </label>
              </div>
              <p className="callout" style={{ marginTop: "0.75rem" }}>
                Ao salvar um código novo: o pedido passa para <strong>Enviado</strong> (se ainda não estiver), o código é registrado no provedor ({settings["tracking.provider"]}) e o e-mail
                de envio é disparado. Como o código de acesso em claro não fica guardado, <strong>um novo código de acesso é enviado</strong> ao cliente nesse e-mail.
              </p>
              <div className="actions tight">
                <button type="submit" className="btn btn-primary">
                  Salvar rastreio
                </button>
              </div>
            </ActionForm>
            {order.trackingCode ? (
              <div className="btn-row" style={{ marginTop: "0.75rem" }}>
                <ActionForm action={syncTrackingNow} inline>
                  <input type="hidden" name="orderId" value={order.id} />
                  <button type="submit" className="btn btn-ghost btn-sm">
                    Sincronizar agora
                  </button>
                </ActionForm>
                <ActionForm action={clearTracking} inline confirm="Remover o código de rastreio deste pedido? O status não será alterado.">
                  <input type="hidden" name="orderId" value={order.id} />
                  <button type="submit" className="btn btn-ghost danger btn-sm">
                    Remover rastreio
                  </button>
                </ActionForm>
              </div>
            ) : null}
          </section>

          {/* ---------- Comunicação ---------- */}
          <section className="card">
            <div className="card-head">
              <h2>Comunicação</h2>
              <span className="muted small">{codePrefix ? `Código de acesso ativo: ${codePrefix}…` : "Sem código de acesso ativo"}</span>
            </div>
            {!order.customerEmail ? <p className="callout warn">Este pedido não tem e-mail. Os envios abaixo vão falhar; use o WhatsApp.</p> : null}
            <div className="stack" style={{ gap: "0.75rem" }}>
              <ActionForm action={resendPix} inline>
                <input type="hidden" name="orderId" value={order.id} />
                <button type="submit" className="btn btn-ghost btn-sm" disabled={!order.pixCode && !order.paymentUrl}>
                  Reenviar Pix
                </button>
                <span className="muted small">lembrete com o copia-e-cola{order.reminderCount ? ` · já enviado ${order.reminderCount}×` : ""}</span>
              </ActionForm>
              <ActionForm action={resendAccessCode} inline>
                <input type="hidden" name="orderId" value={order.id} />
                <button type="submit" className="btn btn-ghost btn-sm">
                  Reenviar código de acesso
                </button>
                <span className="muted small">gera um código novo, revoga os antigos e mostra aqui uma vez</span>
              </ActionForm>
              <ActionForm action={sendConfirmation} inline>
                <input type="hidden" name="orderId" value={order.id} />
                <button type="submit" className="btn btn-ghost btn-sm">
                  Enviar confirmação
                </button>
                <span className="muted small">e-mail “pagamento confirmado” com novo código</span>
              </ActionForm>
              <ActionForm action={sendShippedEmail} inline>
                <input type="hidden" name="orderId" value={order.id} />
                <button type="submit" className="btn btn-ghost btn-sm" disabled={!order.trackingCode}>
                  Enviar aviso de envio
                </button>
                <span className="muted small">requer código de rastreio · envia um novo código de acesso</span>
              </ActionForm>
            </div>
            {wa ? (
              <div className="actions">
                <a className="btn btn-blue btn-sm" href={wa} target="_blank" rel="noopener noreferrer">
                  Abrir WhatsApp com mensagem pronta
                </a>
              </div>
            ) : null}

            <h3 className="section-title">E-mails enviados</h3>
            {emails.length === 0 ? (
              <p className="muted small">Nenhum e-mail registrado para este pedido.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Template</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emails.map((m) => (
                      <tr key={m.id}>
                        <td className="nowrap">{formatDateTime(m.sentAt)}</td>
                        <td>
                          {m.templateKey ?? "—"}
                          <span className="cell-sub">
                            {m.to} · {m.triggeredBy}
                          </span>
                          {m.error ? <span className="cell-sub field-error">{m.error}</span> : null}
                        </td>
                        <td>
                          <EmailStatusBadge status={m.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {webhooks.length ? (
              <>
                <h3 className="section-title">Webhooks recebidos</h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Quando</th>
                        <th>Origem</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {webhooks.map((w) => (
                        <tr key={w.id}>
                          <td className="nowrap">
                            <Link href={`/admin/webhooks/${w.id}`}>{formatDateTime(w.receivedAt)}</Link>
                          </td>
                          <td>
                            <SourceBadge source={w.source} />
                            {w.provider ? <span className="cell-sub">{w.provider}</span> : null}
                          </td>
                          <td>
                            <WebhookBadge status={w.status} />
                            {w.detail ? <span className="cell-sub">{w.detail}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>

          <section className="card">
            <JsonBlock value={{ ...order, customerDocumentEnc: order.customerDocumentEnc ? "[cifrado]" : null }} summary="Ver registro completo (JSON)" />
          </section>
        </div>
      </div>
    </>
  );
}
