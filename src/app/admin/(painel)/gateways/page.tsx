import "@/app/admin/checkout-admin.css";
import { requireAdmin } from "@/lib/auth/session";
import { ActionForm } from "@/components/admin/ActionForm";
import { CopyButton } from "@/components/admin/CopyButton";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { PLAIN_INPUT, SECRET_INPUT } from "@/components/admin/input-props";
import {
  createIronpayOffers,
  regeneratePostbackToken,
  saveCheckoutModeSettings,
  saveFastpaySettings,
  saveIronpaySettings,
  saveMercadopagoSettings,
  saveRoutingSettings,
  saveTestCouponSettings,
} from "@/lib/admin/actions/gateways";
import { getGateway, GATEWAY_LABELS, type GatewayName } from "@/lib/gateways";
import { describeSecret, getSettings } from "@/lib/settings";
import { env } from "@/lib/env";

export const metadata = { title: "Gateways | Painel AquaBlast" };

const PROVIDERS: GatewayName[] = ["ironpay", "mercadopago", "fastpay"];

export default async function GatewaysPage() {
  await requireAdmin();
  const s = await getSettings([
    "gateway.pix",
    "gateway.card",
    "gateway.ironpay.apiToken",
    "gateway.ironpay.offerHashUnit",
    "gateway.ironpay.offerHashKit",
    "gateway.ironpay.productHashUnit",
    "gateway.ironpay.productHashKit",
    "gateway.mercadopago.accessToken",
    "gateway.mercadopago.publicKey",
    "gateway.mercadopago.webhookSecret",
    "gateway.fastpay.apiKey",
    "gateway.postbackToken",
    "checkout.mode",
    "checkout.testCoupon",
    "checkout.cardComingSoon",
  ] as const);

  const ironpayToken = await describeSecret("gateway.ironpay.apiToken");
  const mpToken = await describeSecret("gateway.mercadopago.accessToken");
  const mpWebhook = await describeSecret("gateway.mercadopago.webhookSecret");
  const fastpayKey = await describeSecret("gateway.fastpay.apiKey");

  const configuredByProvider: Record<GatewayName, boolean> = {
    ironpay: await getGateway("ironpay").configured(),
    mercadopago: await getGateway("mercadopago").configured(),
    fastpay: await getGateway("fastpay").configured(),
    simulado: await getGateway("simulado").configured(),
  };

  const appUrl = env().APP_URL.replace(/\/$/, "");
  const postbackToken = s["gateway.postbackToken"];
  const coupon = s["checkout.testCoupon"];
  const postbackFor = (provider: GatewayName) => `${appUrl}/api/webhooks/gateway/${provider}/${postbackToken || "<gere-um-token>"}`;

  const modo = (
    <section className="card">
      <div className="card-head">
        <h2>Modo do checkout</h2>
      </div>
      <p className="small muted">
        <strong>Zedy</strong>: os botões de compra do site vão para a Zedy (como hoje). <strong>Próprio</strong>: vão para
        <code> /checkout</code>, usando os gateways configurados nas outras abas.
      </p>
      <ActionForm action={saveCheckoutModeSettings} confirm="Trocar o modo do checkout agora? Isso muda para onde os links de compra do site apontam.">
        <div className="routing-grid">
          <label className="field">
            <span>Modo</span>
            <select key={s["checkout.mode"]} name="checkout.mode" defaultValue={s["checkout.mode"]}>
              <option value="zedy">Zedy</option>
              <option value="proprio">Checkout próprio</option>
            </select>
          </label>
        </div>
        <button className="btn" type="submit">
          Salvar modo
        </button>
      </ActionForm>
    </section>
  );

  const cupom = (
    <section className="card">
      <div className="card-head">
        <h2>Cupom de teste (Pix)</h2>
      </div>
      <p className="small muted">
        Para testar o gateway com um Pix real de valor baixo. Ligado, o link <code>{appUrl}/checkout?pack=unit&amp;cupom=CODIGO</code> cobra
        o valor abaixo no Pix. Só vale no Pix e só com o código na URL. <strong>Desligue depois do teste.</strong>
      </p>
      <ActionForm key={`${coupon.enabled}|${coupon.code}|${coupon.pixCents}`} action={saveTestCouponSettings}>
        <label className="check">
          <input type="checkbox" name="enabled" defaultChecked={coupon.enabled} />
          <span>Cupom ligado</span>
        </label>
        <div className="routing-grid">
          <label className="field">
            <span>Código</span>
            <input name="code" defaultValue={coupon.code} maxLength={40} autoComplete="off" />
          </label>
          <label className="field">
            <span>Valor do Pix com cupom (R$)</span>
            <input name="pixReais" inputMode="decimal" defaultValue={(coupon.pixCents / 100).toFixed(2).replace(".", ",")} />
          </label>
        </div>
        <button className="btn" type="submit">
          Salvar cupom
        </button>
      </ActionForm>
    </section>
  );

  const roteamento = (
    <section className="card">
      <div className="card-head">
        <h2>Roteamento de pagamento</h2>
      </div>
      <p className="small muted">Qual gateway processa cada método no checkout próprio.</p>
      <ActionForm key={`${s["gateway.card"]}|${s["checkout.cardComingSoon"]}`} action={saveRoutingSettings}>
        <div className="routing-grid">
          <label className="field">
            <span>Pix</span>
            <select key={s["gateway.pix"]} name="gateway.pix" defaultValue={s["gateway.pix"]}>
              <option value="ironpay">IronPay</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="fastpay">FastPay</option>
              <option value="simulado">Simulado (teste)</option>
            </select>
          </label>
          <label className="field">
            <span>Cartão de crédito</span>
            <select key={s["gateway.card"]} name="gateway.card" defaultValue={s["gateway.card"]}>
              <option value="desligado">Desligado</option>
              <option value="ironpay">IronPay</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="fastpay">FastPay</option>
              <option value="simulado">Simulado (teste)</option>
            </select>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" name="checkout.cardComingSoon" defaultChecked={s["checkout.cardComingSoon"]} />
          <span>Com o cartão desligado, mostrar a opção Cartão com as parcelas (ao abrir, avisa que está em ativação e leva ao Pix)</span>
        </label>
        <button className="btn" type="submit">
          Salvar roteamento
        </button>
      </ActionForm>
    </section>
  );

  const postback = (
    <section className="card">
      <div className="card-head">
        <h2>Postback (webhook dos gateways)</h2>
      </div>
      <p className="small muted">
        Cadastre esta URL no painel de cada gateway (uma por provedor — o provedor faz parte do caminho). O token é secreto:
        quem não souber o token recebe 404.
      </p>
      <div className="stack">
        {PROVIDERS.map((p) => (
          <div key={p} className="pix-mono-box" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
            <span>
              {GATEWAY_LABELS[p]}: {postbackFor(p)}
            </span>
            {postbackToken ? <CopyButton value={postbackFor(p)} /> : null}
          </div>
        ))}
      </div>
      <details style={{ marginTop: "0.5rem" }}>
        <summary className="small">Token atual</summary>
        <p className="small muted">{postbackToken ? "••••" + postbackToken.slice(-4) : "Nenhum token gerado ainda."}</p>
      </details>
      <ActionForm action={regeneratePostbackToken} confirm="Gerar um novo token invalida a URL antiga. Você vai precisar atualizar o cadastro no painel de cada gateway. Continuar?">
        <button className="btn btn-outline" type="submit">
          Gerar novo token
        </button>
      </ActionForm>
    </section>
  );

  const credenciais = (
    <div className="gw-grid">
      <div className={`gw-card ${configuredByProvider.ironpay ? "is-active" : ""}`}>
        <div className="gw-card-head">
          <h3>IronPay</h3>
          <span className={`gw-dot ${configuredByProvider.ironpay ? "is-on" : ""}`} title={configuredByProvider.ironpay ? "Configurado" : "Faltam credenciais"} />
        </div>
        <p className="small muted">Pix e cartão. Cartão em claro (sem tokenização) — o número nunca é salvo por nós.</p>
        <ActionForm key={`${s["gateway.ironpay.offerHashUnit"]}|${s["gateway.ironpay.offerHashKit"]}|${s["gateway.ironpay.productHashUnit"]}|${s["gateway.ironpay.productHashKit"]}`} action={saveIronpaySettings} autoComplete="off">
          <label className="field">
            <span>Token da API {ironpayToken.configured ? <span className="secret-hint is-on">{ironpayToken.hint}</span> : null}</span>
            <input name="gateway.ironpay.apiToken" placeholder={ironpayToken.configured ? "Deixe em branco para manter" : ""} {...SECRET_INPUT} />
          </label>
          <div className="grid-2">
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
          </div>
          <button className="btn" type="submit">
            Salvar IronPay
          </button>
        </ActionForm>
        <p className="small muted">
          A IronPay não mostra o offer hash na tela. Com o token e o product hash da unidade salvos, este botão cria as
          ofertas que faltam (unidade e kit) direto na IronPay e preenche os campos. O kit sem product hash usa o da unidade.
        </p>
        <ActionForm action={createIronpayOffers} inline>
          <button className="btn btn-outline" type="submit">
            Criar ofertas na IronPay
          </button>
        </ActionForm>
      </div>

      <div className={`gw-card ${configuredByProvider.mercadopago ? "is-active" : ""}`}>
        <div className="gw-card-head">
          <h3>Mercado Pago</h3>
          <span className={`gw-dot ${configuredByProvider.mercadopago ? "is-on" : ""}`} title={configuredByProvider.mercadopago ? "Configurado" : "Faltam credenciais"} />
        </div>
        <p className="small muted">Pix e cartão. Cartão só por token (tokenizado no navegador) — o número nunca chega ao servidor.</p>
        <ActionForm action={saveMercadopagoSettings} autoComplete="off">
          <label className="field">
            <span>Access token {mpToken.configured ? <span className="secret-hint is-on">{mpToken.hint}</span> : null}</span>
            <input name="gateway.mercadopago.accessToken" placeholder={mpToken.configured ? "Deixe em branco para manter" : ""} {...SECRET_INPUT} />
          </label>
          <label className="field">
            <span>Public key</span>
            <input name="gateway.mercadopago.publicKey" defaultValue={s["gateway.mercadopago.publicKey"]} {...PLAIN_INPUT} />
          </label>
          <label className="field">
            <span>Webhook secret {mpWebhook.configured ? <span className="secret-hint is-on">{mpWebhook.hint}</span> : null}</span>
            <input name="gateway.mercadopago.webhookSecret" placeholder={mpWebhook.configured ? "Deixe em branco para manter" : ""} {...SECRET_INPUT} />
          </label>
          <button className="btn" type="submit">
            Salvar Mercado Pago
          </button>
        </ActionForm>
      </div>

      <div className={`gw-card ${configuredByProvider.fastpay ? "is-active" : ""}`}>
        <div className="gw-card-head">
          <h3>FastPay</h3>
          <span className={`gw-dot ${configuredByProvider.fastpay ? "is-on" : ""}`} title={configuredByProvider.fastpay ? "Configurado" : "Falta a chave"} />
        </div>
        <p className="small muted">Pix e cartão. Cartão em claro. Sem estorno por API — o estorno é feito no painel da FastPay.</p>
        <ActionForm action={saveFastpaySettings} autoComplete="off">
          <label className="field">
            <span>Chave de API {fastpayKey.configured ? <span className="secret-hint is-on">{fastpayKey.hint}</span> : null}</span>
            <input name="gateway.fastpay.apiKey" placeholder={fastpayKey.configured ? "Deixe em branco para manter" : ""} {...SECRET_INPUT} />
          </label>
          <button className="btn" type="submit">
            Salvar FastPay
          </button>
        </ActionForm>
      </div>

      <div className="gw-card is-active">
        <div className="gw-card-head">
          <h3>Simulado (teste)</h3>
          <span className="gw-dot is-on" title="Sempre disponível fora de produção" />
        </div>
        <p className="small muted">
          Não cobra nada de verdade. Fica disponível fora de produção, e em produção só enquanto o checkout não estiver no
          modo próprio. Serve para testar o fluxo antes de ligar um gateway de verdade.
        </p>
      </div>
    </div>
  );

  const comecar = (
    <section className="card callout">
      <div className="card-head">
        <h2>Para começar a vender</h2>
      </div>
      <ul className="check">
        <li>Preencha as credenciais do gateway escolhido (aba Credenciais).</li>
        <li>Cadastre a URL de postback dele no painel do gateway (aba Postback).</li>
        <li>Escolha o gateway no roteamento de Pix e/ou cartão.</li>
        <li>Confira os preços em Produtos.</li>
        <li>Troque o modo do checkout para &quot;Próprio&quot; quando estiver pronto para vender de verdade.</li>
      </ul>
    </section>
  );

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Gateways</h1>
        <p className="muted">Credenciais de pagamento do checkout próprio e escolha de qual gateway processa cada método.</p>
      </div>

      <SectionTabs
        label="Seções dos gateways"
        tabs={[
          {
            id: "checkout",
            label: "Checkout",
            content: (
              <div className="panel-cols">
                <div>
                  {modo}
                  {roteamento}
                </div>
                <div>
                  {cupom}
                  {comecar}
                </div>
              </div>
            ),
          },
          { id: "credenciais", label: "Credenciais", content: credenciais },
          { id: "postback", label: "Postback", content: postback },
        ]}
      />
    </div>
  );
}
