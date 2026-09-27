import "@/app/admin/checkout-admin.css";
import { requireAdmin } from "@/lib/auth/session";
import { ActionForm } from "@/components/admin/ActionForm";
import { saveConsentSettings, saveGa4Settings, saveMetaSettings, sendGa4Test, sendMetaTest } from "@/lib/admin/actions/pixels";
import { describeSecret, getSettings } from "@/lib/settings";
import { db } from "@/db";
import { conversionEvents } from "@/db/schema";
import { desc } from "drizzle-orm";

export const metadata = { title: "Pixels | Painel AquaBlast" };

const DEST_LABEL: Record<string, string> = { meta: "Meta", ga4: "GA4" };
const STATUS_LABEL: Record<string, string> = { sent: "Enviado", error: "Erro", skipped: "Ignorado", sending: "Enviando" };

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
        <h1>Pixels</h1>
        <p className="muted">
          Meta Conversions API e GA4 Measurement Protocol. Os eventos são enviados pelo <strong>servidor</strong>, direto da
          compra do checkout próprio — não usam o Google Tag Manager do site nem o pixel do navegador.
        </p>
      </div>

      <div className="cols-2">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Meta Conversions API</h2>
            </div>
            <ActionForm action={saveMetaSettings}>
              <label className="check">
                <input type="checkbox" name="ads.meta.enabled" defaultChecked={s["ads.meta.enabled"]} />
                <span>Enviar eventos para a Meta</span>
              </label>
              <label className="field">
                <span>ID do Pixel</span>
                <input name="ads.meta.pixelId" defaultValue={s["ads.meta.pixelId"]} maxLength={40} />
              </label>
              <label className="field">
                <span>Token de acesso {metaToken.configured ? <span className="secret-hint is-on">{metaToken.hint}</span> : null}</span>
                <input name="ads.meta.accessToken" type="password" placeholder={metaToken.configured ? "Deixe em branco para manter" : ""} autoComplete="off" />
              </label>
              <label className="field">
                <span>Código de evento de teste (Gerenciador de Eventos → Eventos de teste)</span>
                <input name="ads.meta.testEventCode" defaultValue={s["ads.meta.testEventCode"]} maxLength={60} />
              </label>
              <button className="btn" type="submit">
                Salvar Meta
              </button>
            </ActionForm>
            <ActionForm action={sendMetaTest} className="af-inline-group">
              <label className="field">
                <span>Código de teste (opcional, usa o salvo acima se vazio)</span>
                <input name="testEventCode" maxLength={60} />
              </label>
              <button className="btn btn-outline" type="submit">
                Enviar evento de teste
              </button>
            </ActionForm>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>GA4 Measurement Protocol</h2>
            </div>
            <ActionForm action={saveGa4Settings}>
              <label className="check">
                <input type="checkbox" name="ads.ga4.enabled" defaultChecked={s["ads.ga4.enabled"]} />
                <span>Enviar eventos para o GA4</span>
              </label>
              <label className="field">
                <span>ID de medição (G-XXXXXXX)</span>
                <input name="ads.ga4.measurementId" defaultValue={s["ads.ga4.measurementId"]} maxLength={40} />
              </label>
              <label className="field">
                <span>Segredo da API {ga4Secret.configured ? <span className="secret-hint is-on">{ga4Secret.hint}</span> : null}</span>
                <input name="ads.ga4.apiSecret" type="password" placeholder={ga4Secret.configured ? "Deixe em branco para manter" : ""} autoComplete="off" />
              </label>
              <button className="btn" type="submit">
                Salvar GA4
              </button>
            </ActionForm>
            <ActionForm action={sendGa4Test}>
              <button className="btn btn-outline" type="submit">
                Validar evento de teste (purchase de exemplo)
              </button>
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
              <button className="btn" type="submit">
                Salvar
              </button>
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
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Destino</th>
                  <th>Evento</th>
                  <th>Status</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.sentAt).toLocaleString("pt-BR")}</td>
                    <td>{DEST_LABEL[e.destination] ?? e.destination}</td>
                    <td>{e.eventName}</td>
                    <td>
                      <span className={`badge tone-${e.status === "sent" ? "green" : e.status === "error" ? "red" : "muted"}`}>
                        {STATUS_LABEL[e.status] ?? e.status}
                      </span>
                    </td>
                    <td className="small muted">{e.detail ?? "—"}</td>
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
