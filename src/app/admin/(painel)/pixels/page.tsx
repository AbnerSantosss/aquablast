import "@/app/admin/checkout-admin.css";
import { requireAdmin } from "@/lib/auth/session";
import { ActionForm } from "@/components/admin/ActionForm";
import { saveConsentSettings, saveGa4Settings, saveMetaSettings, sendGa4Test, sendMetaTest } from "@/lib/admin/actions/pixels";
import { describeSecret, getSettings } from "@/lib/settings";
import { db } from "@/db";
import { conversionEvents } from "@/db/schema";
import { desc } from "drizzle-orm";
import { AD_EVENT_FUNNEL, AD_EVENT_LABELS } from "@/lib/tracking-ads/types";
import { PLAIN_INPUT, SECRET_INPUT } from "@/components/admin/input-props";
import { formatDateTime } from "@/lib/admin/format";

export const metadata = { title: "Pixels | Painel AquaBlast" };

const DEST_LABEL: Record<string, string> = { meta: "Meta", ga4: "GA4" };
const STATUS_LABEL: Record<string, string> = { sent: "Enviado", error: "Erro", skipped: "Ignorado", sending: "Enviando" };

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

export default async function PixelsPage() {
  await requireAdmin();
  const s = await getSettings([
    "ads.meta.enabled",
    "ads.meta.pixelId",
    "ads.meta.testEventCode",
    "ads.ga4.enabled",
    "ads.ga4.measurementId",
    "ads.consentRequired",
  ] as const);
  const metaToken = await describeSecret("ads.meta.accessToken");
  const ga4Secret = await describeSecret("ads.ga4.apiSecret");
  const events = await db.query.conversionEvents.findMany({ orderBy: [desc(conversionEvents.sentAt)], limit: 30 });

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
              <label className="field">
                <span>Token de acesso {metaToken.configured ? <span className="secret-hint is-on">{metaToken.hint}</span> : null}</span>
                <input name="ads.meta.accessToken" placeholder={metaToken.configured ? "Deixe em branco para manter" : "EAA..."} {...SECRET_INPUT} />
              </label>
              <label className="field">
                <span>Código de evento de teste fixo (deixe vazio em produção)</span>
                <input name="ads.meta.testEventCode" defaultValue={s["ads.meta.testEventCode"]} maxLength={60} {...PLAIN_INPUT} />
                <span className="hint">
                  Se preenchido, vai junto em <strong>todos os eventos reais</strong> das compras, que passam a aparecer só em &quot;Eventos de
                  teste&quot; da Meta. Para testar, use o campo do envio de teste abaixo.
                </span>
              </label>
              {s["ads.meta.testEventCode"] ? (
                <p className="small" role="alert">
                  <span className="badge tone-red">Atenção</span> Há um código de teste salvo ({s["ads.meta.testEventCode"]}): as compras reais estão indo como teste.
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
                <span className="hint">Vale só para este envio. Vazio: usa o código fixo acima, se houver.</span>
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
              <label className="field">
                <span>Segredo da API {ga4Secret.configured ? <span className="secret-hint is-on">{ga4Secret.hint}</span> : null}</span>
                <input name="ads.ga4.apiSecret" placeholder={ga4Secret.configured ? "Deixe em branco para manter" : ""} {...SECRET_INPUT} />
              </label>
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
              <div className="actions">
                <button type="submit" className="btn btn-primary">
                  Salvar consentimento
                </button>
              </div>
            </ActionForm>
          </section>
        </div>

        <section className="card evt-log">
          <div className="card-head">
            <h2>Últimos eventos enviados</h2>
          </div>
          {events.length === 0 ? (
            <p className="muted small">Nenhum evento registrado ainda.</p>
          ) : (
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
                    <td className={`small muted evt-detail${e.detail ? "" : " tc-empty"}`}>{e.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
