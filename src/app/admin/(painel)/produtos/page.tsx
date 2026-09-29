import "@/app/admin/checkout-admin.css";
import { requireAdmin } from "@/lib/auth/session";
import { saveBumpSettings, saveInstallmentsSettings, savePricesSettings } from "@/lib/admin/actions/products";
import { ActionForm } from "@/components/admin/ActionForm";
import { getSettings } from "@/lib/settings";
import { KIT_SAVING, PRICES } from "@/lib/site/constants";

export const metadata = { title: "Produtos | Painel AquaBlast" };

const cents = (v: number) => (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function ProdutosPage() {
  await requireAdmin();
  const s = await getSettings(["checkout.prices", "checkout.maxInstallments", "checkout.bumpEnabled"] as const);
  const prices = s["checkout.prices"];
  const parcela = (totalCents: number, n: number) => cents(Math.ceil(totalCents / n));

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Produtos</h1>
        <p className="muted">Preços, parcelamento e order bump do checkout próprio. Não afeta o link da Zedy.</p>
      </div>

      <div className="panel-cols">
        <div>
          <section className="card">
            <div className="card-head">
              <h2>Preços</h2>
            </div>
            <p className="small muted">
              Valores em reais, separados por vírgula (ex.: 159,90). O preço do Pix precisa ser igual ou menor que o do cartão.
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
                  <span>Kit — Pix</span>
                  <input name="kitPix" defaultValue={(prices.kit.pix / 100).toFixed(2).replace(".", ",")} required />
                </label>
                <label className="field">
                  <span>Kit — Cartão</span>
                  <input name="kitCard" defaultValue={(prices.kit.card / 100).toFixed(2).replace(".", ",")} required />
                </label>
              </div>
              <button className="btn" type="submit">
                Salvar preços
              </button>
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
              <button className="btn" type="submit">
                Salvar
              </button>
            </ActionForm>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Order bump</h2>
            </div>
            <ActionForm action={saveBumpSettings}>
              <label className="check">
                <input type="checkbox" name="bumpEnabled" defaultChecked={s["checkout.bumpEnabled"]} />
                <span>Mostrar o order bump (oferta do kit) na tela de pagamento</span>
              </label>
              <button className="btn" type="submit">
                Salvar
              </button>
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
                  <td>Kit</td>
                  <td>{cents(prices.kit.pix)}</td>
                  <td>{cents(prices.kit.card)}</td>
                  <td>{parcela(prices.kit.card, s["checkout.maxInstallments"])}</td>
                </tr>
              </tbody>
            </table>
            <p className="small muted" style={{ marginTop: "0.5rem" }}>
              Textos do site público (página de vendas) usam os valores fixos de <code>site/constants.ts</code>: unidade{" "}
              {PRICES.unit.pix} / {PRICES.unit.card}, kit {PRICES.kit.pix} / {PRICES.kit.card}, economia do kit {KIT_SAVING}. Esses
              textos só mudam com um pedido explícito, não junto com os preços do checkout desta tela.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
