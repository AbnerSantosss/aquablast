import "@/app/admin/checkout-admin.css";
import { requireAdmin } from "@/lib/auth/session";
import { ActionForm } from "@/components/admin/ActionForm";
import { saveConsentSettings, saveGa4Settings, saveMetaSettings, sendGa4Test, sendMetaTest } from "@/lib/admin/actions/pixels";
import { verifyIntegrationAction } from "@/lib/admin/actions/integrations";
import { getIntegrationStatus } from "@/lib/admin/integrations/status";
import { describeSecret, getSettings, META_SERVER_EVENTS, type MetaServerEvent } from "@/lib/settings";
import { db } from "@/db";
import { conversionEvents } from "@/db/schema";
import { desc, inArray, notInArray } from "drizzle-orm";
import { AD_EVENT_FUNNEL, AD_EVENT_LABELS } from "@/lib/tracking-ads/types";
import { PLAIN_INPUT } from "@/components/admin/input-props";
import { SecretField } from "@/components/admin/SecretField";
import { formatDateTime } from "@/lib/admin/format";

export const metadata = { title: "Pixels | Painel AquaBlast" };

const DEST_LABEL: Record<string, string> = { meta: "Meta", ga4: "GA4" };
const STATUS_LABEL: Record<string, string> = { sent: "Enviado", error: "Erro", skipped: "Ignorado", sending: "Enviando" };
/** Quando cada evento sai do servidor (api/track/page, api/checkout/cart e sync.ts). */
const META_EVENT_HELP: Record<MetaServerEvent, string> = {
  PageView: "visitou qualquer página do site",
  ViewContent: "abriu a página do produto",
  InitiateCheckout: "começou o checkout",
  AddPaymentInfo: "deixou e-mail ou celular",
  Purchase: "pagamento aprovado",
};

/** Campos de user_data que a Meta usa para casar o evento com a pessoa (resumo acima do JSON). */
const USER_DATA_LABEL: [string, string][] = [
  ["fbc", "fbc (clique no anúncio)"],
  ["fbp", "fbp (navegador)"],
  ["em", "e-mail"],
  ["ph", "telefone"],
  ["external_id", "id externo"],
  ["client_ip_address", "IP"],
  ["client_user_agent", "navegador (user agent)"],
];

/** user_data do 1º evento do corpo enviado à Meta ({ data: [ { user_data } ] }). */
function userDataOf(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  const data = payload?.data;
  if (!Array.isArray(data)) return null;
  const first: unknown = data[0];
  if (!first || typeof first !== "object") return null;
  const ud = (first as Record<string, unknown>).user_data;
  return ud && typeof ud === "object" ? (ud as Record<string, unknown>) : null;
}

/** "Ver payload": o que foi enviado à Meta. Resumo de user_data (tem/não tem) e o JSON inteiro, sem token. */
function PayloadView({ payload }: { payload: Record<string, unknown> | null }) {
  if (!payload) return null;
  const ud = userDataOf(payload);
  return (
    <details className="evt-payload">
      <summary>Ver payload enviado</summary>
      {ud ? (
        <ul className="evt-ud">
          {USER_DATA_LABEL.map(([key, label]) => {
            const has = ud[key] !== undefined && ud[key] !== "" && !(Array.isArray(ud[key]) && (ud[key] as unknown[]).length === 0);
            return (
              <li key={key} className={has ? "is-on" : "is-off"}>
                {has ? "✓" : "✗"} {label}
              </li>
            );
          })}
        </ul>
      ) : null}
      <pre className="pix-mono-box evt-json">{JSON.stringify(payload, null, 2)}</pre>
    </details>
  );
}

function EventSelect() {
  return (
    <label className="field">
      <span>Evento</span>
      <select name="event" defaultValue="all" {...PLAIN_INPUT}>
        <option value="all">Sequência completa ({AD_EVENT_FUNNEL.join(" → ")})</option>
        {AD_EVENT_FUNNEL.map((e) => (
          <option key={e} value={e}>
            {AD_EVENT_LABELS[e]}
          </option>
        ))}
      </select>
    </label>
  );
}

const PAGE_EVENTS = ["PageView", "ViewContent"];

type EventRow = typeof conversionEvents.$inferSelect;

function EventTable({ events, empty }: { events: EventRow[]; empty: string }) {
  if (events.length === 0) return <p className="muted small">{empty}</p>;
  return (
    <table className="table table-cards">
      <thead>
        <tr>
          <th>Evento</th>
          <th>Status</th>
          <th>Detalhe</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id}>
            <td className="tc-top">
              {e.eventName}
              <span className="cell-sub nowrap">
                {DEST_LABEL[e.destination] ?? e.destination} · {formatDateTime(e.sentAt)}
              </span>
            </td>
            <td className="tc-top tc-end">
              <span className={`badge tone-${e.status === "sent" ? "green" : e.status === "error" ? "red" : "muted"}`}>
                {STATUS_LABEL[e.status] ?? e.status}
              </span>
            </td>
            <td className={`small muted evt-detail${e.detail || e.payload ? "" : " tc-empty"}`}>
              {e.detail ?? "—"}
              <PayloadView payload={e.payload} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function PixelsPage() {
  await requireAdmin();
  const s = await getSettings([
    "ads.meta.enabled",
    "ads.meta.pixelId",
    "ads.meta.testEventCode",
    "ads.meta.testMode",
    "ads.meta.events",
    "ads.ga4.enabled",
    "ads.ga4.measurementId",
    "ads.consentRequired",
  ] as const);
  const [metaToken, ga4Secret, status] = await Promise.all([describeSecret("ads.meta.accessToken"), describeSecret("ads.ga4.apiSecret"), getIntegrationStatus()]);
  const metaEvents: readonly string[] = Array.isArray(s["ads.meta.events"]) ? s["ads.meta.events"] : [];
  const [events, pageEvents] = await Promise.all([
    db.query.conversionEvents.findMany({ where: notInArray(conversionEvents.eventName, PAGE_EVENTS), orderBy: [desc(conversionEvents.sentAt)], limit: 30 }),
    db.query.conversionEvents.findMany({ where: inArray(conversionEvents.eventName, PAGE_EVENTS), orderBy: [desc(conversionEvents.sentAt)], limit: 30 }),
  ]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Pixels</h1>
          <p className="sub">
            Meta Conversions API e GA4 Measurement Protocol. Os eventos são enviados pelo <strong>servidor</strong>, direto da
            compra do checkout próprio — não usam o Google Tag Manager do site nem o pixel do navegador.
          </p>
        </div>
      </div>

      <div className="cols-2 split">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Meta Conversions API</h2>
            </div>
            <ActionForm action={saveMetaSettings} autoComplete="off">
              <label className="check">
                <input type="checkbox" name="ads.meta.enabled" defaultChecked={s["ads.meta.enabled"]} />
                <span>Enviar eventos para a Meta</span>
              </label>
              <label className="field">
                <span>ID do Pixel</span>
                <input name="ads.meta.pixelId" defaultValue={s["ads.meta.pixelId"]} maxLength={40} inputMode="numeric" {...PLAIN_INPUT} />
              </label>
              <SecretField
                name="ads.meta.accessToken"
                label="Token de acesso"
                secret={metaToken}
                status={status.meta}
                verifiable
                verifyAction={verifyIntegrationAction}
                placeholder="EAA..."
              />
              <div className="field" role="group" aria-labelledby="meta-events-label">
                <span id="meta-events-label">Eventos que o site envia para a Meta (API de Conversões)</span>
                <div className="form-row" style={{ gap: "0.25rem 1.25rem" }}>
                  {META_SERVER_EVENTS.map((e) => (
                    <label key={e} className="check" style={{ marginTop: 0 }} title={META_EVENT_HELP[e]}>
                      <input type="checkbox" name="ads.meta.events" value={e} defaultChecked={metaEvents.includes(e)} />
                      <span>
                        {e} <span className="muted small">({META_EVENT_HELP[e]})</span>
                      </span>
                    </label>
                  ))}
                </div>
                <span className="hint">
                  Se o gateway de pagamento já envia a compra direto para a Meta, desmarque Purchase aqui para não contar a venda duas vezes.
                  PageView e ViewContent também saem do navegador (Pixel no Google Tag Manager) com o mesmo id de evento, e a Meta
                  junta os dois: marcar aqui não duplica a contagem, só dá à Meta a cópia do servidor (que bloqueador de anúncio
                  não barra).
                </span>
              </div>
              <label className="field">
                <span>Código de evento de teste</span>
                <input name="ads.meta.testEventCode" defaultValue={s["ads.meta.testEventCode"]} maxLength={60} placeholder="TEST12345" {...PLAIN_INPUT} />
              </label>
              <label className="check">
                <input type="checkbox" name="ads.meta.testMode" defaultChecked={s["ads.meta.testMode"]} />
                <span>
                  Enviar como evento de teste (usar o código acima)
                  <span className="hint" style={{ display: "block" }}>
                    Desmarcado, o código fica guardado e as compras reais vão normalmente para os relatórios.
                  </span>
                </span>
              </label>
              {s["ads.meta.testMode"] ? (
                <p className="small" role="alert">
                  <span className="badge tone-red">Atenção</span> Modo teste ligado: as compras reais estão indo só para &quot;Eventos de teste&quot; da
                  Meta. Desmarque ao terminar.
                </p>
              ) : null}
              <div className="actions">
                <button type="submit" className="btn btn-primary">
                  Salvar Meta
                </button>
              </div>
            </ActionForm>
            <h3 className="section-title">Testar envio</h3>
            <ActionForm action={sendMetaTest} autoComplete="off">
              <EventSelect />
              <label className="field">
                <span>Código de teste (Gerenciador de Eventos → Eventos de teste)</span>
                <input name="testEventCode" maxLength={60} placeholder={s["ads.meta.testEventCode"] || "TEST12345"} {...PLAIN_INPUT} />
                <span className="hint">Vale só para este envio. Vazio: usa o código salvo acima (mesmo com o modo teste desligado).</span>
              </label>
              <div className="actions">
                <button type="submit" className="btn btn-ghost">
                  Enviar teste para a Meta
                </button>
              </div>
            </ActionForm>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>GA4 Measurement Protocol</h2>
            </div>
            <ActionForm action={saveGa4Settings} autoComplete="off">
              <label className="check">
                <input type="checkbox" name="ads.ga4.enabled" defaultChecked={s["ads.ga4.enabled"]} />
                <span>Enviar eventos para o GA4</span>
              </label>
              <label className="field">
                <span>ID de medição (G-XXXXXXX)</span>
                <input name="ads.ga4.measurementId" defaultValue={s["ads.ga4.measurementId"]} maxLength={40} placeholder="G-XXXXXXX" {...PLAIN_INPUT} />
              </label>
              <SecretField
                name="ads.ga4.apiSecret"
                label="Segredo da API"
                secret={ga4Secret}
                verifiable={false}
                help="O GA4 aceita qualquer segredo sem avisar: confira nos relatórios em tempo real depois de uma compra."
              />
              {/* GA4 sem verificação: o Measurement Protocol responde 2xx mesmo com segredo errado (só a validação de formato existe). */}
              <div className="actions">
                <button type="submit" className="btn btn-primary">
                  Salvar GA4
                </button>
              </div>
            </ActionForm>
            <h3 className="section-title">Testar envio</h3>
            <ActionForm action={sendGa4Test} autoComplete="off">
              <EventSelect />
              <p className="small muted">Usa o endpoint de validação do GA4: confere o formato e não grava nada nos relatórios.</p>
              <div className="actions">
                <button type="submit" className="btn btn-ghost">
                  Validar no GA4
                </button>
              </div>
            </ActionForm>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Consentimento</h2>
            </div>
            <ActionForm action={saveConsentSettings}>
              <label className="check">
                <input type="checkbox" name="ads.consentRequired" defaultChecked={s["ads.consentRequired"]} />
                <span>Só enviar eventos com consentimento do comprador (recomendado)</span>
              </label>
              <p className="hint">
                Vale para os eventos do checkout. PageView e ViewContent seguem o Pixel do navegador, que já dispara na página sem
                pedir consentimento.
              </p>
              <div className="actions">
                <button type="submit" className="btn btn-primary">
                  Salvar consentimento
                </button>
              </div>
            </ActionForm>
          </section>
        </div>

        <div className="stack">
          <section className="card evt-log">
            <div className="card-head">
              <h2>Últimos eventos do checkout</h2>
            </div>
            <p className="muted small">
              Em cada evento da Meta, &quot;Ver payload enviado&quot; mostra o corpo exato que foi para a API de Conversões (o token
              não vai no corpo). E-mail, telefone e nome saem com hash SHA-256; fbc, fbp, IP e navegador saem como estão, que é o
              que a Meta pede. Eventos enviados antes de 30/09/2026 não têm payload gravado.
            </p>
            <EventTable events={events} empty="Nenhum evento do checkout registrado ainda." />
          </section>

          <section className="card evt-log">
            <div className="card-head">
              <h2>Últimas visitas enviadas (PageView e ViewContent)</h2>
            </div>
            <p className="muted small">
              Uma linha por página carregada, com o mesmo id de evento que o Pixel do navegador mandou. Ficam guardadas só as dos
              últimos 7 dias.
            </p>
            <EventTable events={pageEvents} empty="Nenhuma visita enviada ainda. Marque PageView e ViewContent acima para enviar." />
          </section>
        </div>
      </div>
    </div>
  );
}
