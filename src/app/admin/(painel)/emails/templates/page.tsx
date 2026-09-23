import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Tone } from "@/components/admin/Badge";
import { requireAdmin } from "@/lib/auth/session";
import { listTemplates } from "@/lib/email/templates";
import { toggleTemplate } from "@/lib/admin/actions/templates";
import { formatDateTime } from "@/lib/admin/format";

export const metadata: Metadata = { title: "Templates de e-mail" };

export default async function TemplatesPage() {
  await requireAdmin();
  const templates = await listTemplates();
  return (
    <>
      <div className="crumbs">
        <Link href="/admin/emails">← E-mails</Link>
      </div>
      <div className="page-head">
        <div>
          <h1>Templates de e-mail</h1>
          <p className="sub">O toggle controla só o envio automático. Reenvios manuais pelo pedido sempre funcionam.</p>
        </div>
      </div>
      <div className="card tpl-list">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Template</th>
                <th>Assunto</th>
                <th>Automático</th>
                <th>Atualizado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.key}>
                  <td>
                    <Link href={`/admin/emails/templates/${t.key}`}>
                      <strong>{t.name}</strong>
                    </Link>
                    <span className="cell-sub mono">{t.key}</span>
                    <span className="row-desc">{t.description}</span>
                  </td>
                  <td>{t.subject}</td>
                  <td>
                    <div className="btn-row" style={{ alignItems: "center" }}>
                      {t.enabled ? <Tone tone="green">Ligado</Tone> : <Tone tone="gray">Desligado</Tone>}
                      <ActionForm action={toggleTemplate} inline>
                        <input type="hidden" name="key" value={t.key} />
                        <button type="submit" className="btn btn-ghost btn-sm">
                          {t.enabled ? "Desligar" : "Ligar"}
                        </button>
                      </ActionForm>
                    </div>
                  </td>
                  <td className="nowrap">{formatDateTime(t.updatedAt)}</td>
                  <td>
                    <Link className="btn btn-sm btn-ghost" href={`/admin/emails/templates/${t.key}`}>
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
