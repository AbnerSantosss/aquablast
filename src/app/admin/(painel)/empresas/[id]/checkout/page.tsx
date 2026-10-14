import "@/app/admin/checkout-admin.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { like } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { ActionForm } from "@/components/admin/ActionForm";
import { PLAIN_INPUT } from "@/components/admin/input-props";
import { SecretField } from "@/components/admin/SecretField";
import {
  saveCompanyCheckoutOptions,
  saveCompanyFastpay,
  saveCompanyIronpay,
  saveCompanyMercadopago,
  saveCompanyRouting,
  saveCompanyStore,
  saveCompanyTheme,
} from "@/lib/admin/actions/companies";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_COMPANY_ID, getCompanyById } from "@/lib/companies";
import { themeDefaults, themeFieldLabels, themeSchema, isoToLocalInput } from "@/lib/checkout/own/theme";
import { describeCompanySecret, getCompanySetting, getCompanySettings, type SettingKey } from "@/lib/settings";
import { CompanyNav } from "../../CompanyNav";

export const metadata = { title: "Checkout e gateway da empresa | Painel AquaBlast" };

const GATEWAY_OPTIONS = [
  ["ironpay", "IronPay"],
  ["mercadopago", "Mercado Pago"],
  ["fastpay", "FastPay"],
  ["simulado", "Simulado (teste)"],
] as const;

function Origin({ own }: { own: boolean }) {
  return <span className={`badge tone-${own ? "green" : "gray"}`}>{own ? "valor próprio" : "herdado do AquaBlast"}</span>;
}

export default async function CheckoutEmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const company = await getCompanyById(id);
  if (!company) notFound();

  if (company.id === DEFAULT_COMPANY_ID) {
    return (
      <div className="stack">
        <CompanyNav company={company} current="checkout" />
        <section className="card">
          <div className="card-head">
            <h2>Checkout e gateway do AquaBlast</h2>
          </div>
          <p className="small muted">O AquaBlast é a empresa padrão e usa as telas globais de sempre:</p>
          <div className="actions">
            <Link href="/admin/checkout" className="btn btn-ghost">
              Personalizar checkout
            </Link>
            <Link href="/admin/gateways" className="btn btn-ghost">
              Gateways
            </Link>
            <Link href="/admin/produtos" className="btn btn-ghost">
              Produtos e preços
            </Link>
            <Link href="/admin/configuracoes" className="btn btn-ghost">
              Configurações
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const rows = await db.select({ key: settings.key }).from(settings).where(like(settings.key, `company:${company.id}:%`));
  const ownKeys = new Set(rows.map((r) => r.key.slice(`company:${company.id}:`.length)));
  const own = (k: SettingKey) => ownKeys.has(k);

  // Sem tema próprio, o checkout herdaria o do AquaBlast (CNPJ, endereço, banner). O formulário parte de um tema
  // neutro, com o nome da empresa, para a primeira gravação já isolar a empresa.
  const storedTheme = await getCompanySetting(company.id, "checkout.theme");
  const neutral = { ...themeDefaults, storeName: company.name.slice(0, 40), companyName: "", companyCnpj: "", companyAddress: "", pixReceiverName: "" };
  const parsed = themeSchema.safeParse(own("checkout.theme") ? storedTheme : neutral);
  const theme = parsed.success ? parsed.data : themeSchema.parse(neutral);

  const s = await getCompanySettings(company.id, [
    "checkout.maxInstallments",
    "checkout.pixTtlSeconds",
    "checkout.cardComingSoon",
    "gateway.pix",
    "gateway.card",
    "gateway.ironpay.offerHashUnit",
    "gateway.ironpay.offerHashKit",
    "gateway.ironpay.productHashUnit",
    "gateway.ironpay.productHashKit",
    "gateway.mercadopago.publicKey",
    "store.name",
    "store.supportEmail",
    "store.supportWhatsapp",
    "store.trackingPageUrl",
  ] as const);
  const ironpayToken = await describeCompanySecret(company.id, "gateway.ironpay.apiToken");
  const mpToken = await describeCompanySecret(company.id, "gateway.mercadopago.accessToken");
  const mpWebhook = await describeCompanySecret(company.id, "gateway.mercadopago.webhookSecret");
  const fastpayKey = await describeCompanySecret(company.id, "gateway.fastpay.apiKey");
  const storeOwn = own("store.name") && own("store.supportEmail") && own("store.supportWhatsapp") && own("store.trackingPageUrl");
  const routingOwn = own("gateway.pix") && own("gateway.card");
  const textField = (name: keyof typeof themeDefaults, max: number, extra?: { required?: boolean; placeholder?: string }) => (
    <label className="field">
      <span>{themeFieldLabels[name]}</span>
      <input name={name} defaultValue={String(theme[name])} maxLength={max} required={extra?.required} placeholder={extra?.placeholder} autoComplete="off" />
    </label>
  );
  const colorField = (name: "colorPrimary" | "colorButton" | "colorAccent" | "colorTimer" | "colorBackground") => (
    <label className="field">
      <span>{themeFieldLabels[name]} (#RRGGBB)</span>
      <input name={name} defaultValue={theme[name]} maxLength={7} pattern="#[0-9a-fA-F]{6}" {...PLAIN_INPUT} />
    </label>
  );
  const hidden = <input type="hidden" name="companyId" value={company.id} />;

  return (
    <div className="stack">
      <CompanyNav company={company} current="checkout" />

      <section className="card callout">
        <p className="small">
          Aqui ficam o tema e o gateway do checkout <code>/c/{company.slug}</code>. O que a empresa ainda não definiu usa o valor do AquaBlast, exceto as credenciais de gateway: essas nunca são herdadas, e a empresa não cobra
          até você informar as dela.
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Aparência e textos</h2> <Origin own={own("checkout.theme")} />
        </div>
        {own("checkout.theme") ? null : (
          <p className="small muted">Sem tema próprio, o checkout herda o tema do AquaBlast, inclusive CNPJ e endereço do rodapé. O formulário abaixo já parte de um tema neutro: salve para isolar a empresa.</p>
        )}
        <ActionForm action={saveCompanyTheme} key={`${own("checkout.theme")}`}>
          {hidden}
          <div className="grid-2">
            {textField("storeName", 40, { required: true })}
            {textField("logoUrl", 500, { placeholder: "https://… ou /caminho.webp" })}
            {colorField("colorPrimary")}
            {colorField("colorButton")}
            {colorField("colorAccent")}
            {colorField("colorTimer")}
            {colorField("colorBackground")}
          </div>

          <h3 className="small" style={{ marginTop: "0.75rem" }}>
            Cronômetro
          </h3>
          <label className="check">
            <input type="checkbox" name="timerEnabled" defaultChecked={theme.timerEnabled} />
            <span>Mostrar cronômetro</span>
          </label>
          <div className="grid-2">
            {textField("timerLabel", 80)}
            <label className="field">
              <span>Fim da oferta (horário de Brasília)</span>
              <input name="timerEnd" type="datetime-local" step={1} defaultValue={isoToLocalInput(theme.timerEnd)} />
            </label>
          </div>

          <h3 className="small" style={{ marginTop: "0.75rem" }}>
            Faixa de frete e banner
          </h3>
          <label className="check">
            <input type="checkbox" name="shipBarEnabled" defaultChecked={theme.shipBarEnabled} />
            <span>Mostrar faixa de frete</span>
          </label>
          <div className="grid-2">
            {textField("shipBarText", 80)}
            {textField("shipBarNote", 100)}
          </div>
          <label className="check">
            <input type="checkbox" name="bannerEnabled" defaultChecked={theme.bannerEnabled} />
            <span>Mostrar banner</span>
          </label>
          <div className="grid-2">
            {textField("bannerEyebrow", 40)}
            {textField("bannerTitle", 80)}
            {textField("bannerSubtitle", 120)}
            {textField("bannerImage", 500, { required: true })}
          </div>

          <h3 className="small" style={{ marginTop: "0.75rem" }}>
            Botão e rodapé
          </h3>
          <div className="grid-2">
            {textField("buttonLabel", 30, { required: true })}
            {textField("badgeText", 30)}
            {textField("footerText", 120)}
          </div>

          <h3 className="small" style={{ marginTop: "0.75rem" }}>
            Dados da empresa no rodapé e Pix
          </h3>
          <p className="small muted">Razão social, CNPJ e endereço da própria empresa (Decreto 7.962/2013). Em branco, o rodapé mostra só o nome da loja.</p>
          <div className="grid-2">
            {textField("companyName", 120)}
            {textField("companyCnpj", 18, { placeholder: "00.000.000/0000-00" })}
            {textField("companyAddress", 160)}
            {textField("pixReceiverName", 80)}
          </div>
          <div className="actions">
            <button type="submit" className="btn btn-primary">
              Salvar aparência
            </button>
          </div>
        </ActionForm>
      </section>

      <div className="cols-2">
        <section className="card">
          <div className="card-head">
            <h2>Parcelamento e Pix</h2>
          </div>
          <ActionForm action={saveCompanyCheckoutOptions} key={`${s["checkout.maxInstallments"]}|${s["checkout.pixTtlSeconds"]}`}>
            {hidden}
            <label className="field">
              <span>
                Máximo de parcelas (1 a 12) <Origin own={own("checkout.maxInstallments")} />
              </span>
              <input name="checkout.maxInstallments" type="number" min={1} max={12} defaultValue={s["checkout.maxInstallments"]} />
            </label>
            <label className="field">
              <span>
                Validade do Pix em segundos (60 a 86400) <Origin own={own("checkout.pixTtlSeconds")} />
              </span>
              <input name="checkout.pixTtlSeconds" type="number" min={60} max={86400} defaultValue={s["checkout.pixTtlSeconds"]} />
            </label>
            <div className="actions">
              <button type="submit" className="btn btn-primary">
                Salvar
              </button>
            </div>
          </ActionForm>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Dados da loja</h2> <Origin own={storeOwn} />
          </div>
          <p className="small muted">Usados em e-mails e na página de rastreio. Ao salvar, os quatro campos passam a ser da empresa, mesmo os vazios.</p>
          <ActionForm action={saveCompanyStore} key={`${s["store.name"]}|${s["store.supportEmail"]}|${s["store.supportWhatsapp"]}|${s["store.trackingPageUrl"]}`}>
            {hidden}
            <label className="field">
              <span>Nome da loja</span>
              <input name="store.name" defaultValue={storeOwn ? s["store.name"] : company.name} maxLength={100} required />
            </label>
            <label className="field">
              <span>E-mail de suporte</span>
              <input name="store.supportEmail" type="email" defaultValue={storeOwn ? s["store.supportEmail"] : ""} maxLength={254} {...PLAIN_INPUT} />
            </label>
            <label className="field">
              <span>WhatsApp (com DDI e DDD)</span>
              <input name="store.supportWhatsapp" defaultValue={storeOwn ? s["store.supportWhatsapp"] : ""} maxLength={30} inputMode="numeric" placeholder="5511999999999" {...PLAIN_INPUT} />
            </label>
            <label className="field">
              <span>Página de rastreio (https:// ou /caminho)</span>
              <input name="store.trackingPageUrl" defaultValue={storeOwn ? s["store.trackingPageUrl"] : ""} maxLength={500} {...PLAIN_INPUT} />
            </label>
            <div className="actions">
              <button type="submit" className="btn btn-primary">
                Salvar dados da loja
              </button>
            </div>
          </ActionForm>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Roteamento de pagamento</h2> <Origin own={routingOwn} />
        </div>
        <ActionForm action={saveCompanyRouting} key={`${s["gateway.pix"]}|${s["gateway.card"]}|${s["checkout.cardComingSoon"]}`}>
          {hidden}
          <div className="routing-grid">
            <label className="field">
              <span>Pix</span>
              <select name="gateway.pix" defaultValue={s["gateway.pix"]}>
                {GATEWAY_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Cartão de crédito</span>
              <select name="gateway.card" defaultValue={s["gateway.card"]}>
                <option value="desligado">Desligado</option>
                {GATEWAY_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="checkout.cardComingSoon" defaultChecked={s["checkout.cardComingSoon"]} />
            <span>Com o cartão desligado, mostrar a opção Cartão com as parcelas (avisa que está em ativação e leva ao Pix)</span>
          </label>
          <div className="actions">
            <button type="submit" className="btn btn-primary">
              Salvar roteamento
            </button>
          </div>
        </ActionForm>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Credenciais do gateway</h2>
        </div>
        <p className="small muted">Valem só para esta empresa. Segredo em branco mantém o atual; use Trocar para informar um novo.</p>
        <div className="gw-grid">
          <div className="gw-card">
            <div className="gw-card-head">
              <h3>IronPay</h3>
            </div>
            <ActionForm action={saveCompanyIronpay} autoComplete="off" key={`${ironpayToken.masked}|${s["gateway.ironpay.offerHashUnit"]}|${s["gateway.ironpay.offerHashKit"]}`}>
              {hidden}
              <SecretField name="gateway.ironpay.apiToken" label="Token da API" secret={ironpayToken} verifiable={false} />
              <label className="field">
                <span>Offer hash — unidade</span>
                <input name="gateway.ironpay.offerHashUnit" defaultValue={s["gateway.ironpay.offerHashUnit"]} {...PLAIN_INPUT} />
              </label>
              <label className="field">
                <span>Offer hash — kit</span>
                <input name="gateway.ironpay.offerHashKit" defaultValue={s["gateway.ironpay.offerHashKit"]} {...PLAIN_INPUT} />
              </label>
              <label className="field">
                <span>Product hash — unidade</span>
                <input name="gateway.ironpay.productHashUnit" defaultValue={s["gateway.ironpay.productHashUnit"]} {...PLAIN_INPUT} />
              </label>
              <label className="field">
                <span>Product hash — kit</span>
                <input name="gateway.ironpay.productHashKit" defaultValue={s["gateway.ironpay.productHashKit"]} {...PLAIN_INPUT} />
              </label>
              <div className="actions">
                <button type="submit" className="btn btn-primary">
                  Salvar IronPay
                </button>
              </div>
            </ActionForm>
          </div>

          <div className="gw-card">
            <div className="gw-card-head">
              <h3>Mercado Pago</h3>
            </div>
            <ActionForm action={saveCompanyMercadopago} autoComplete="off" key={`${mpToken.masked}|${mpWebhook.masked}|${s["gateway.mercadopago.publicKey"]}`}>
              {hidden}
              <SecretField name="gateway.mercadopago.accessToken" label="Access token" secret={mpToken} verifiable={false} />
              <label className="field">
                <span>Public key</span>
                <input name="gateway.mercadopago.publicKey" defaultValue={s["gateway.mercadopago.publicKey"]} {...PLAIN_INPUT} />
              </label>
              <SecretField name="gateway.mercadopago.webhookSecret" label="Webhook secret" secret={mpWebhook} verifiable={false} />
              <div className="actions">
                <button type="submit" className="btn btn-primary">
                  Salvar Mercado Pago
                </button>
              </div>
            </ActionForm>
          </div>

          <div className="gw-card">
            <div className="gw-card-head">
              <h3>FastPay</h3>
            </div>
            <ActionForm action={saveCompanyFastpay} autoComplete="off" key={fastpayKey.masked}>
              {hidden}
              <SecretField name="gateway.fastpay.apiKey" label="Chave de API" secret={fastpayKey} verifiable={false} />
              <div className="actions">
                <button type="submit" className="btn btn-primary">
                  Salvar FastPay
                </button>
              </div>
            </ActionForm>
          </div>
        </div>
      </section>
    </div>
  );
}
