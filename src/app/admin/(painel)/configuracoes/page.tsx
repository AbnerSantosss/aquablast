import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/ActionForm";
import { Tone } from "@/components/admin/Badge";
import { CopyButton } from "@/components/admin/CopyButton";
import { requireAdmin } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { describeSecret, getSettings } from "@/lib/settings";
import { CARRIERS } from "@/lib/tracking/provider";
import {
  addAdminUser,
  changeOwnPassword,
  saveAccessCodeSettings,
  saveCheckoutSettings,
  saveEmailSettings,
  savePixReminderSettings,
  saveStoreSettings,
  saveTrackingSettings,
  testEmailDelivery,
  toggleAdminUser,
} from "@/lib/admin/actions/settings";
import { fieldMapToLines } from "@/lib/admin/form";
import { formatDateTime } from "@/lib/admin/format";
import { listAdmins } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Configurações" };

const FIELD_NAMES = [
  "externalId",
  "orderNumber",
  "eventName",
  "paymentStatus",
  "paymentMethod",
  "customerName",
  "customerEmail",
  "customerPhone",
  "customerDocument",
  "addressLine1",
  "addressLine2",
  "addressNeighborhood",
  "addressCity",
  "addressState",
  "addressPostalCode",
  "addressCountry",
  "items",
  "amountTotal",
  "pixCode",
  "pixQrUrl",
  "pixExpiresAt",
  "paymentUrl",
  "trackingCode",
  "carrierName",
];

function SecretHint({ s }: { s: { configured: boolean; hint: string } }) {
  return <span className={`secret-hint ${s.configured ? "is-on" : ""}`}>{s.configured ? `configurado ${s.hint} · deixe em branco para manter` : "não configurado"}</span>;
}

export default async function SettingsPage() {
  const session = await requireAdmin();
  const s = await getSettings([
    "store.name",
    "store.supportWhatsapp",
    "store.supportEmail",
    "store.trackingPageUrl",
    "email.provider",
    "email.from.name",
    "email.from.address",
    "email.replyTo",
    "email.smtp.host",
    "email.smtp.port",
    "email.smtp.secure",
    "email.smtp.user",
    "email.pixReminder.afterMinutes",
    "email.pixReminder.maxCount",
    "tracking.provider",
    "tracking.17track.defaultCarrier",
    "tracking.syncIntervalMinutes",
    "checkout.provider",
    "checkout.fieldMap",
    "checkout.signatureHeader",
    "accessCode.validityDays",
  ] as const);
  const [smtpPass, resendKey, brevoKey, trackKey, whSecret, admins] = await Promise.all([
    describeSecret("email.smtp.pass"),
    describeSecret("email.resend.apiKey"),
    describeSecret("email.brevo.apiKey"),
    describeSecret("tracking.17track.apiKey"),
    describeSecret("checkout.webhookSecret"),
    listAdmins(),
  ]);
  const e = env();
  const base = e.APP_URL.replace(/\/$/, "");
  const checkoutWebhookUrl = `${base}/api/webhooks/checkout/${e.CHECKOUT_WEBHOOK_TOKEN}`;
  const trackingWebhookUrl = `${base}/api/webhooks/tracking`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Configurações</h1>
          <p className="sub">Tudo aqui vale imediatamente. Segredos ficam cifrados e nunca são exibidos inteiros.</p>
        </div>
      </div>
      <nav className="toc" aria-label="Seções">
        <a href="#loja">Loja</a>
        <a href="#email">E-mail</a>
        <a href="#pix">Lembrete de Pix</a>
        <a href="#rastreio">Rastreio</a>
        <a href="#checkout">Checkout</a>
        <a href="#acesso">Código de acesso</a>
        <a href="#admin">Administradores</a>
      </nav>

      {/* ---------- Loja ---------- */}
      <section className="card" id="loja">
        <div className="card-head">
          <h2>Loja</h2>
          <p className="muted small">Usado nos e-mails e na página de rastreio.</p>
        </div>
        <ActionForm action={saveStoreSettings}>
          <div className="grid-2">
            <label className="field">
              <span>Nome da loja</span>
              <input name="store.name" defaultValue={s["store.name"]} required maxLength={100} />
            </label>
            <label className="field">
              <span>WhatsApp de suporte (só números, com DDI)</span>
              <input name="store.supportWhatsapp" defaultValue={s["store.supportWhatsapp"]} inputMode="numeric" maxLength={30} placeholder="5581999999999" />
            </label>
            <label className="field">
              <span>E-mail de suporte</span>
              <input name="store.supportEmail" type="email" defaultValue={s["store.supportEmail"]} maxLength={254} />
            </label>
            <label className="field">
              <span>Página de rastreio</span>
              <input name="store.trackingPageUrl" defaultValue={s["store.trackingPageUrl"]} maxLength={500} placeholder="/rastrear" />
            </label>
          </div>
          <div className="actions tight">
            <button type="submit" className="btn btn-primary">
              Salvar loja
            </button>
          </div>
        </ActionForm>
      </section>

      {/* ---------- E-mail ---------- */}
      <section className="card" id="email">
        <div className="card-head">
          <h2>E-mail</h2>
          <p className="muted small">Escolha o provedor e preencha só os campos dele. Campos de senha/chave em branco mantêm o valor atual.</p>
        </div>
        <ActionForm action={saveEmailSettings}>
          <div className="grid-2">
            <label className="field">
              <span>Provedor</span>
              <select name="email.provider" defaultValue={s["email.provider"]}>
                <option value="smtp">SMTP (Gmail, Hostinger, etc.)</option>
                <option value="resend">Resend</option>
                <option value="brevo">Brevo</option>
              </select>
            </label>
            <label className="field">
              <span>Nome do remetente</span>
              <input name="email.from.name" defaultValue={s["email.from.name"]} maxLength={100} />
            </label>
            <label className="field">
              <span>E-mail remetente</span>
              <input name="email.from.address" type="email" defaultValue={s["email.from.address"]} maxLength={254} />
            </label>
            <label className="field">
              <span>Responder para (opcional)</span>
              <input name="email.replyTo" type="email" defaultValue={s["email.replyTo"]} maxLength={254} />
            </label>
          </div>

          <h3 className="section-title">SMTP</h3>
          <div className="grid-2">
            <label className="field">
              <span>Host</span>
              <input name="email.smtp.host" defaultValue={s["email.smtp.host"]} maxLength={200} />
            </label>
            <label className="field">
              <span>Porta</span>
              <input name="email.smtp.port" type="number" defaultValue={s["email.smtp.port"]} min={1} max={65535} />
            </label>
            <label className="field">
              <span>Usuário</span>
              <input name="email.smtp.user" defaultValue={s["email.smtp.user"]} maxLength={254} autoComplete="off" />
            </label>
            <label className="field">
              <span>Senha</span>
              <input name="email.smtp.pass" type="password" autoComplete="new-password" maxLength={500} placeholder={smtpPass.configured ? "••••••••" : ""} />
              <SecretHint s={smtpPass} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="email.smtp.secure" defaultChecked={s["email.smtp.secure"]} />
            <span>Conexão segura (SSL/TLS na porta 465; desmarque para STARTTLS na 587)</span>
          </label>

          <h3 className="section-title">Resend</h3>
          <label className="field">
            <span>API key</span>
            <input name="email.resend.apiKey" type="password" autoComplete="new-password" maxLength={500} placeholder={resendKey.configured ? "••••••••" : "re_…"} />
            <SecretHint s={resendKey} />
          </label>

          <h3 className="section-title">Brevo</h3>
          <label className="field">
            <span>API key</span>
            <input name="email.brevo.apiKey" type="password" autoComplete="new-password" maxLength={500} placeholder={brevoKey.configured ? "••••••••" : "xkeysib-…"} />
            <SecretHint s={brevoKey} />
          </label>

          <div className="actions tight">
            <button type="submit" className="btn btn-primary">
              Salvar e-mail
            </button>
          </div>
        </ActionForm>
        <h3 className="section-title">Testar envio</h3>
        <ActionForm action={testEmailDelivery} inline>
          <label className="field">
            <span>Para</span>
            <input name="to" type="email" defaultValue={session.email} maxLength={254} style={{ width: "16rem", maxWidth: "100%" }} />
          </label>
          <button type="submit" className="btn btn-ghost">
            Enviar e-mail de teste
          </button>
        </ActionForm>
      </section>

      {/* ---------- Pix ---------- */}
      <section className="card" id="pix">
        <div className="card-head">
          <h2>Lembrete de Pix</h2>
          <p className="muted small">Reenvio automático do Pix para quem não pagou. Usa o template “Lembrete de Pix”; 0 minutos desliga.</p>
        </div>
        <ActionForm action={savePixReminderSettings}>
          <div className="grid-2">
            <label className="field">
              <span>Enviar após (minutos)</span>
              <input name="email.pixReminder.afterMinutes" type="number" min={0} max={43200} defaultValue={s["email.pixReminder.afterMinutes"]} />
            </label>
            <label className="field">
              <span>Máximo de lembretes por pedido</span>
              <input name="email.pixReminder.maxCount" type="number" min={0} max={20} defaultValue={s["email.pixReminder.maxCount"]} />
            </label>
          </div>
          <div className="actions tight">
            <button type="submit" className="btn btn-primary">
              Salvar lembrete
            </button>
          </div>
        </ActionForm>
      </section>

      {/* ---------- Rastreio ---------- */}
      <section className="card" id="rastreio">
        <div className="card-head">
          <h2>Rastreio</h2>
          <p className="muted small">Com o 17TRACK, os códigos são registrados automaticamente e a transportadora avisa por webhook.</p>
        </div>
        <ActionForm action={saveTrackingSettings}>
          <div className="grid-2">
            <label className="field">
              <span>Provedor</span>
              <select name="tracking.provider" defaultValue={s["tracking.provider"]}>
                <option value="17track">17TRACK (automático)</option>
                <option value="manual">Manual (sem integração)</option>
              </select>
            </label>
            <label className="field">
              <span>API key do 17TRACK</span>
              <input name="tracking.17track.apiKey" type="password" autoComplete="new-password" maxLength={500} placeholder={trackKey.configured ? "••••••••" : ""} />
              <SecretHint s={trackKey} />
            </label>
            <label className="field">
              <span>Transportadora padrão</span>
              <select name="tracking.17track.defaultCarrier" defaultValue={String(s["tracking.17track.defaultCarrier"])}>
                {CARRIERS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Intervalo de sincronização (minutos)</span>
              <input name="tracking.syncIntervalMinutes" type="number" min={5} max={1440} defaultValue={s["tracking.syncIntervalMinutes"]} />
              <span className="hint">Usado pelo cron de sincronização para pedidos em trânsito.</span>
            </label>
          </div>
          <div className="actions tight">
            <button type="submit" className="btn btn-primary">
              Salvar rastreio
            </button>
          </div>
        </ActionForm>
        <h3 className="section-title">Webhook da transportadora</h3>
        <div className="copy-line">
          <code>{trackingWebhookUrl}</code>
          <CopyButton value={trackingWebhookUrl} small />
        </div>
        <div className="callout" style={{ marginTop: "0.75rem" }}>
          No painel do 17TRACK (Settings → Webhook), cole a URL acima. Os eventos chegam aqui, atualizam o status do pedido e disparam os e-mails “Saiu para entrega” e “Entregue”.
          Sem webhook, o cron de sincronização continua consultando no intervalo configurado.
        </div>
      </section>

      {/* ---------- Checkout ---------- */}
      <section className="card" id="checkout">
        <div className="card-head">
          <h2>Checkout</h2>
          <p className="muted small">Recebe pedidos e pagamentos da plataforma de checkout.</p>
        </div>
        <h3 className="section-title">URL do webhook (cole no checkout)</h3>
        <div className="copy-line">
          <code>{checkoutWebhookUrl}</code>
          <CopyButton value={checkoutWebhookUrl} small />
        </div>
        <p className="muted small" style={{ marginTop: "0.5rem" }}>
          O token na URL é o segredo: não compartilhe fora da plataforma. Para trocar, altere <code className="mono">CHECKOUT_WEBHOOK_TOKEN</code> no ambiente.
        </p>
        <ActionForm action={saveCheckoutSettings}>
          <div className="grid-2" style={{ marginTop: "1rem" }}>
            <label className="field">
              <span>Nome do provedor (rótulo)</span>
              <input name="checkout.provider" defaultValue={s["checkout.provider"]} maxLength={60} placeholder="generic, yampi, cartpanda…" />
            </label>
            <label className="field">
              <span>Header da assinatura (opcional)</span>
              <input name="checkout.signatureHeader" defaultValue={s["checkout.signatureHeader"]} maxLength={100} placeholder="x-signature" />
              <span className="hint">Se a plataforma assina o corpo com HMAC, informe o header e o segredo.</span>
            </label>
            <label className="field span-2">
              <span>Segredo do webhook (opcional)</span>
              <input name="checkout.webhookSecret" type="password" autoComplete="new-password" maxLength={500} placeholder={whSecret.configured ? "••••••••" : ""} />
              <SecretHint s={whSecret} />
            </label>
            <label className="field span-2">
              <span>Mapa de campos (opcional)</span>
              <textarea name="checkout.fieldMap" rows={8} className="mono" defaultValue={fieldMapToLines(s["checkout.fieldMap"])} placeholder={"orderNumber=data.order.code\ncustomerEmail=data.customer.email\npaymentStatus=data.status"} />
              <span className="hint">
                Uma linha por campo no formato <code className="mono">campoInterno=caminho.no.payload</code> (ou um objeto JSON). Só é necessário quando a detecção automática não encontra o
                dado.
              </span>
            </label>
          </div>
          <div className="callout" style={{ marginTop: "0.75rem" }}>
            <strong>Campos internos aceitos:</strong>
            <div className="chips" style={{ marginTop: "0.4rem" }}>
              {FIELD_NAMES.map((f) => (
                <span key={f} className="chip">
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div className="actions tight">
            <button type="submit" className="btn btn-primary">
              Salvar checkout
            </button>
          </div>
        </ActionForm>
      </section>

      {/* ---------- Código de acesso ---------- */}
      <section className="card" id="acesso">
        <div className="card-head">
          <h2>Código de acesso</h2>
          <p className="muted small">Código que o cliente usa na página de rastreio. Emitir um novo revoga os anteriores.</p>
        </div>
        <ActionForm action={saveAccessCodeSettings}>
          <label className="field" style={{ maxWidth: "16rem" }}>
            <span>Validade (dias)</span>
            <input name="accessCode.validityDays" type="number" min={1} max={3650} defaultValue={s["accessCode.validityDays"]} />
          </label>
          <div className="actions tight">
            <button type="submit" className="btn btn-primary">
              Salvar validade
            </button>
          </div>
        </ActionForm>
      </section>

      {/* ---------- Admin ---------- */}
      <section className="card" id="admin">
        <div className="card-head">
          <h2>Administradores</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Último acesso</th>
                <th>Situação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.name}
                    {a.id === session.sub ? <span className="cell-sub">você</span> : null}
                  </td>
                  <td className="break">{a.email}</td>
                  <td className="nowrap">{formatDateTime(a.lastLoginAt)}</td>
                  <td>{a.disabledAt ? <Tone tone="red">Desativado</Tone> : <Tone tone="green">Ativo</Tone>}</td>
                  <td>
                    {a.id !== session.sub ? (
                      <ActionForm action={toggleAdminUser} inline confirm={a.disabledAt ? `Reativar ${a.email}?` : `Desativar ${a.email}? A pessoa não conseguirá mais entrar.`}>
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className={`btn btn-sm btn-ghost ${a.disabledAt ? "" : "danger"}`}>
                          {a.disabledAt ? "Reativar" : "Desativar"}
                        </button>
                      </ActionForm>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="cols-2" style={{ marginTop: "1.25rem" }}>
          <div>
            <h3 className="section-title">Trocar minha senha</h3>
            <ActionForm action={changeOwnPassword}>
              <div className="stack" style={{ gap: "0.75rem" }}>
                <label className="field">
                  <span>Senha atual</span>
                  <input name="currentPassword" type="password" autoComplete="current-password" required maxLength={200} />
                </label>
                <label className="field">
                  <span>Nova senha (mín. 10 caracteres)</span>
                  <input name="newPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={200} />
                </label>
                <label className="field">
                  <span>Confirmar nova senha</span>
                  <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={200} />
                </label>
              </div>
              <div className="actions tight">
                <button type="submit" className="btn btn-ghost">
                  Alterar senha
                </button>
              </div>
            </ActionForm>
          </div>
          <div>
            <h3 className="section-title">Adicionar administrador</h3>
            <ActionForm action={addAdminUser}>
              <div className="stack" style={{ gap: "0.75rem" }}>
                <label className="field">
                  <span>Nome</span>
                  <input name="name" required maxLength={100} autoComplete="off" />
                </label>
                <label className="field">
                  <span>E-mail</span>
                  <input name="email" type="email" required maxLength={254} autoComplete="off" />
                </label>
                <label className="field">
                  <span>Senha inicial (mín. 10 caracteres)</span>
                  <input name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" />
                </label>
              </div>
              <div className="actions tight">
                <button type="submit" className="btn btn-ghost">
                  Criar administrador
                </button>
              </div>
            </ActionForm>
          </div>
        </div>
      </section>
    </>
  );
}
