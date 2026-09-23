"use client";

import { useActionState, useState } from "react";
import { restoreTemplate, saveTemplate, sendTemplateTest } from "@/lib/admin/actions/templates";

/** Mesma regra de substituição de lib/email/templates (duplicada aqui porque aquele módulo importa o banco). */
function render(source: string, vars: Record<string, string>): string {
  return source.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => vars[k] ?? "");
}

export function TemplateEditor({
  templateKey,
  initialSubject,
  initialBody,
  enabled,
  placeholders,
  sample,
  adminEmail,
}: {
  templateKey: string;
  initialSubject: string;
  initialBody: string;
  enabled: boolean;
  placeholders: readonly string[];
  sample: Record<string, string>;
  adminEmail: string;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [isEnabled, setEnabled] = useState(enabled);
  const [saveState, saveAction, saving] = useActionState(saveTemplate, null);
  const [testState, testAction, testing] = useActionState(sendTemplateTest, null);
  const [restoreState, restoreAction, restoring] = useActionState(restoreTemplate, null);

  const previewHtml = render(body, sample);
  const previewSubject = render(subject, sample);

  return (
    <div className="tpl-editor">
      <form action={saveAction} className="card tpl-form" id="tpl-form">
        <input type="hidden" name="key" value={templateKey} />
        <label className="field">
          <span>Assunto</span>
          <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} required />
        </label>
        <label className="field">
          <span>Corpo (HTML)</span>
          <textarea name="bodyHtml" value={body} onChange={(e) => setBody(e.target.value)} rows={22} spellCheck={false} className="mono" required />
        </label>
        <label className="check">
          <input type="checkbox" name="enabled" checked={isEnabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Envio automático ligado (o reenvio manual pelo pedido funciona mesmo desligado)</span>
        </label>
        <div className="placeholders">
          <strong>Variáveis disponíveis</strong>
          <div className="chips">
            {placeholders.map((p) => (
              <button
                key={p}
                type="button"
                className="chip"
                title={`Exemplo: ${sample[p.replace(/[{}]/g, "")] ?? ""}`}
                onClick={() => setBody((b) => b + p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Salvando…" : "Salvar template"}
          </button>
          <button type="submit" className="btn btn-ghost" formAction={testAction} disabled={testing} title={`Envia o conteúdo atual (mesmo sem salvar) para ${adminEmail}`}>
            {testing ? "Enviando…" : "Enviar teste para meu e-mail"}
          </button>
          <button
            type="submit"
            className="btn btn-ghost danger"
            formAction={restoreAction}
            disabled={restoring}
            onClick={(e) => {
              if (!window.confirm("Restaurar o assunto e o corpo para o padrão? As alterações salvas serão perdidas.")) e.preventDefault();
            }}
          >
            {restoring ? "Restaurando…" : "Restaurar padrão"}
          </button>
        </div>
        {saveState ? <p className={`af-result ${saveState.ok ? "is-ok" : "is-err"}`}>{saveState.message}</p> : null}
        {testState ? <p className={`af-result ${testState.ok ? "is-ok" : "is-err"}`}>{testState.message}</p> : null}
        {restoreState ? (
          <p className={`af-result ${restoreState.ok ? "is-ok" : "is-err"}`}>
            {restoreState.message}
            {restoreState.ok ? " Recarregue a página para ver o conteúdo padrão." : ""}
          </p>
        ) : null}
      </form>

      <section className="card tpl-preview" aria-label="Pré-visualização">
        <header className="card-head">
          <h2>Pré-visualização</h2>
          <p className="muted small">Renderizada com dados de exemplo, em um iframe isolado.</p>
        </header>
        <p className="preview-subject">
          <span className="muted small">Assunto:</span> <strong>{previewSubject}</strong>
        </p>
        <iframe title="Pré-visualização do e-mail" className="preview-frame" sandbox="" srcDoc={previewHtml} />
      </section>
    </div>
  );
}
