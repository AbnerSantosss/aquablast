import "@/app/admin/checkout-admin.css";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { companyWebhookDeliveries } from "@/db/schema";
import { ActionForm } from "@/components/admin/ActionForm";
import { PLAIN_INPUT, SECRET_INPUT } from "@/components/admin/input-props";
import {
  deleteCompany,
  generateCompanyApiKey,
  revokeCompanyApiKey,
  saveCompanyData,
  saveCompanyWebhookSecret,
} from "@/lib/admin/actions/companies";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_COMPANY_ID, getCompanyById } from "@/lib/companies";
import { CompanyNav } from "../CompanyNav";

export const metadata = { title: "Empresa | Painel AquaBlast" };

export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const company = await getCompanyById(id);
  if (!company) notFound();
  const isDefault = company.id === DEFAULT_COMPANY_ID;
  const deliveries = await db
    .select({
      id: companyWebhookDeliveries.id,
      event: companyWebhookDeliveries.event,
      status: companyWebhookDeliveries.status,
      attempts: companyWebhookDeliveries.attempts,
      responseStatus: companyWebhookDeliveries.responseStatus,
      error: companyWebhookDeliveries.error,
      createdAt: companyWebhookDeliveries.createdAt,
    })
    .from(companyWebhookDeliveries)
    .where(eq(companyWebhookDeliveries.companyId, company.id))
    .orderBy(desc(companyWebhookDeliveries.createdAt))
    .limit(15);

  return (
    <div className="stack">
      <CompanyNav company={company} current="dados" />

      <section className="card">
        <div className="card-head">
          <h2>Dados da empresa</h2>
        </div>
        <ActionForm action={saveCompanyData} key={`${company.updatedAt.getTime()}`}>
          <input type="hidden" name="companyId" value={company.id} />
          <div className="grid-2">
            <label className="field">
              <span>Nome</span>
              <input name="name" defaultValue={company.name} maxLength={80} required />
            </label>
            <label className="field">
              <span>Slug (não muda)</span>
              <input defaultValue={company.slug} readOnly className="mono" aria-readonly="true" />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="active" defaultChecked={company.active} disabled={isDefault} />
            <span>Empresa ativa{isDefault ? " (a empresa padrão não pode ser desativada)" : ""}</span>
          </label>

          <h3 className="small" style={{ marginTop: "0.75rem" }}>
            Webhook de saída
          </h3>
          <p className="small muted">
            URL que recebe os avisos de pedido pago e de pedido enviado (com código de rastreio), assinados com HMAC. Use https:// (http só para localhost).
          </p>
          <label className="field">
            <span>URL do webhook</span>
            <input name="webhookUrl" type="url" defaultValue={company.webhookUrl ?? ""} maxLength={500} placeholder="https://minha-loja.com/api/aquablast-webhook" {...PLAIN_INPUT} />
          </label>

          <h3 className="small" style={{ marginTop: "0.75rem" }}>
            Origens liberadas (CORS)
          </h3>
          <p className="small muted">
            Sites que podem chamar a API pelo navegador. Uma por linha, só esquema e domínio (ex.: <code>https://minha-loja.com</code>). Chamadas de servidor para servidor não precisam de origem.
          </p>
          <label className="field">
            <span>Origens</span>
            <textarea name="allowedOrigins" rows={4} defaultValue={(company.allowedOrigins ?? []).join("\n")} maxLength={4000} spellCheck={false} />
          </label>

          <div className="actions">
            <button type="submit" className="btn btn-primary">
              Salvar dados
            </button>
          </div>
        </ActionForm>
      </section>

      <div className="cols-2">
        <section className="card">
          <div className="card-head">
            <h2>Chave de API</h2>
          </div>
          <p className="small muted">
            Usada no cabeçalho <code>Authorization: Bearer &lt;chave&gt;</code> da API <code>/api/v1</code>. A chave aparece uma única vez, ao gerar; no banco fica só o hash.
          </p>
          <p>
            {company.apiKeyPrefix ? (
              <>
                Chave atual: <code>{company.apiKeyPrefix}…</code> <span className="badge tone-green">Ativa</span>
              </>
            ) : (
              <span className="badge tone-gray">Nenhuma chave gerada</span>
            )}
          </p>
          <ActionForm
            action={generateCompanyApiKey}
            confirm={company.apiKeyPrefix ? "Gerar uma nova chave invalida a atual. A integração para de funcionar até você trocar a chave lá. Continuar?" : undefined}
          >
            <input type="hidden" name="companyId" value={company.id} />
            <div className="actions">
              <button type="submit" className="btn btn-primary">
                {company.apiKeyPrefix ? "Regenerar chave" : "Gerar chave de API"}
              </button>
            </div>
          </ActionForm>
          {company.apiKeyPrefix ? (
            <ActionForm action={revokeCompanyApiKey} confirm="Revogar a chave de API desta empresa? A integração deixa de funcionar.">
              <input type="hidden" name="companyId" value={company.id} />
              <div className="actions">
                <button type="submit" className="btn btn-ghost">
                  Revogar chave
                </button>
              </div>
            </ActionForm>
          ) : null}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Segredo do webhook</h2>
          </div>
          <p className="small muted">
            Chave usada para assinar (HMAC) os webhooks de saída; a loja confere a assinatura com ela. Fica cifrada no banco.
          </p>
          <p>
            <span className={`badge tone-${company.webhookSecret ? "green" : "gray"}`}>{company.webhookSecret ? "Segredo configurado" : "Sem segredo"}</span>
          </p>
          <ActionForm action={saveCompanyWebhookSecret} autoComplete="off">
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="mode" value="generate" />
            <div className="actions">
              <button type="submit" className="btn btn-primary">
                {company.webhookSecret ? "Gerar novo segredo" : "Gerar segredo"}
              </button>
            </div>
          </ActionForm>
          <ActionForm action={saveCompanyWebhookSecret} autoComplete="off">
            <input type="hidden" name="companyId" value={company.id} />
            <label className="field">
              <span>Ou cole um segredo seu (em branco = manter o atual)</span>
              <input name="webhookSecret" maxLength={300} {...SECRET_INPUT} />
            </label>
            <div className="actions">
              <button type="submit" className="btn btn-ghost">
                Salvar segredo
              </button>
            </div>
          </ActionForm>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Últimos envios de webhook</h2>
        </div>
        {deliveries.length === 0 ? (
          <p className="small muted">Nenhum webhook enviado ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Evento</th>
                  <th>Situação</th>
                  <th>Tentativas</th>
                  <th>HTTP</th>
                  <th>Erro</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{d.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                    <td className="mono small">{d.event}</td>
                    <td>
                      <span className={`badge tone-${d.status === "delivered" ? "green" : d.status === "failed" ? "red" : "gray"}`}>{d.status}</span>
                    </td>
                    <td>{d.attempts}</td>
                    <td>{d.responseStatus ?? "—"}</td>
                    <td className="small">{d.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isDefault ? (
        <section className="card callout">
          <p className="small">
            O AquaBlast é a empresa padrão: o checkout, o gateway e os preços dele continuam sendo editados nas telas de sempre (Produtos, Gateways, Personalizar checkout e Configurações).
            Não pode ser apagada.
          </p>
        </section>
      ) : (
        <section className="card">
          <div className="card-head">
            <h2>Apagar empresa</h2>
          </div>
          <p className="small muted">
            Só é possível apagar uma empresa sem pedidos nem carrinhos. Apaga também os produtos e as configurações dela. Para empresas com histórico, desative em vez de apagar.
          </p>
          <ActionForm action={deleteCompany} confirm="Apagar esta empresa e todos os produtos dela? Não dá para desfazer.">
            <input type="hidden" name="companyId" value={company.id} />
            <label className="field">
              <span>
                Digite o slug <code>{company.slug}</code> para confirmar
              </span>
              <input name="confirmSlug" maxLength={40} {...PLAIN_INPUT} />
            </label>
            <div className="actions">
              <button type="submit" className="btn btn-ghost danger">
                Apagar empresa
              </button>
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
