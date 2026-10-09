import "@/app/admin/checkout-admin.css";
import { requireAdmin } from "@/lib/auth/session";
import { saveBumpSettings, saveInstallmentsSettings, savePricesSettings } from "@/lib/admin/actions/products";
import { ActionForm } from "@/components/admin/ActionForm";
import { getSettings } from "@/lib/settings";
import { buildSitePrices } from "@/lib/site/prices";
import { FULL_SHIPPING_CENTS, FULL_SHIPPING_LABEL } from "@/lib/checkout/own/shipping";

export const metadata = { title: "Produtos | Painel AquaBlast" };

const cents = (v: number) => (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function ProdutosPage() {
  await requireAdmin();
  const s = await getSettings(["checkout.prices", "checkout.maxInstallments", "checkout.bumpEnabled"] as const);
  const prices = s["checkout.prices"];
  const site = buildSitePrices(prices, s["checkout.maxInstallments"]);
  const parcela = (totalCents: number, n: number) => cents(Math.round(totalCents / n)); // mesmo arredondamento do checkout (pricing.ts)

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Produtos</h1>
          <p className="sub">Preços, parcelamento e order bump do checkout próprio. Não afeta o link da Zedy.</p>
        </div>
      </div>

      <div className="panel-cols">
        <div>
          <section className="card">
            <div className="card-head">
              <h2>Preços</h2>
            </div>
            <p className="small muted">
              Valores em reais, separados por vírgula (ex.: 149,90). O preço do Pix precisa ser igual ou menor que o do cartão.
            </p>
            <ActionForm action={savePricesSettings} confirm="Alterar os preços do checkout próprio agora?">
              <div className="grid-2">
                <label className="field">
                  <span>Unidade — Pix</span>
                  <input name="unitPix" defaultValue={(prices.unit.pix / 100).toFixed(2).replace(".", ",")} required />
                </label>
                <label className="field">
                  <span>Unidade — Cartão</span>
                  <input name="unitCard" defaultValue={(prices.unit.card / 100).toFixed(2).replace(".", ",")} required />
                </label>
                <label className="field">
                  <span>Com 2ª unidade — Pix</span>
                  <input name="kitPix" defaultValue={(prices.kit.pix / 100).toFixed(2).replace(".", ",")} required />
                </label>
                <label className="field">
                  <span>Com 2ª unidade — Cartão</span>
                  <input name="kitCard" defaultValue={(prices.kit.card / 100).toFixed(2).replace(".", ",")} required />
                </label>
              </div>
              <div className="actions">
                <button type="submit" className="btn btn-primary">
                  Salvar preços
                </button>
              </div>
            </ActionForm>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Parcelamento</h2>
            </div>
            <ActionForm action={saveInstallmentsSettings}>
              <label className="field">
                <span>Máximo de parcelas no cartão</span>
                <input name="maxInstallments" type="number" min={1} max={12} defaultValue={s["checkout.maxInstallments"]} required />
              </label>
              <div className="actions">
                <button type="submit" className="btn btn-primary">
                  Salvar parcelamento
                </button>
              </div>
            </ActionForm>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Order bump</h2>
            </div>
            <ActionForm action={saveBumpSettings}>
              <label className="check">
                <input type="checkbox" name="bumpEnabled" defaultChecked={s["checkout.bumpEnabled"]} />
                <span>Mostrar a oferta opcional da 2ª unidade na tela de pagamento</span>
              </label>
              <div className="actions">
                <button type="submit" className="btn btn-primary">
                  Salvar order bump
                </button>
              </div>
            </ActionForm>
          </section>
        </div>
        <div>
          <section className="card">
            <div className="card-head">
              <h2>Valores calculados (referência)</h2>
            </div>
            <p className="small muted">
              Só leitura — calculados a partir dos preços salvos e do parcelamento máximo. Não é possível editar aqui.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Pix</th>
                  <th>Cartão à vista</th>
                  <th>{s["checkout.maxInstallments"]}x no cartão</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Unidade</td>
                  <td>{cents(prices.unit.pix)}</td>
                  <td>{cents(prices.unit.card)}</td>
                  <td>{parcela(prices.unit.card, s["checkout.maxInstallments"])}</td>
                </tr>
                <tr>
                  <td>Com 2ª unidade</td>
                  <td>{cents(prices.kit.pix)}</td>
                  <td>{cents(prices.kit.card)}</td>
                  <td>{parcela(prices.kit.card, s["checkout.maxInstallments"])}</td>
                </tr>
              </tbody>
            </table>
            <p className="small muted" style={{ marginTop: "0.5rem" }}>
              A página de vendas oferece uma unidade: {site.unit.pix} no Pix ou {site.unit.card} no cartão.
              A segunda unidade é opcional no checkout: +{cents(prices.kit.pix - prices.unit.pix)} no Pix
              ou +{cents(prices.kit.card - prices.unit.card)} no cartão. Os valores acima são dos produtos,
              sem frete. Ao salvar, o site atualiza na próxima visita. No modo Zedy, o valor cobrado lá
              é cadastrado na própria Zedy.
            </p>
          </section>
          <section className="card">
            <div className="card-head"><h2>{FULL_SHIPPING_LABEL}</h2></div>
            <p>Uma unidade: {cents(FULL_SHIPPING_CENTS)}. Com a segunda unidade, frete grátis.</p>
            <p className="small muted">
              Total de uma unidade com frete: {cents(prices.unit.pix + FULL_SHIPPING_CENTS)} no Pix ou {cents(prices.unit.card + FULL_SHIPPING_CENTS)} no cartão.
              Com a segunda unidade: {cents(prices.kit.pix)} no Pix ou {cents(prices.kit.card)} no cartão, já com frete grátis.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
