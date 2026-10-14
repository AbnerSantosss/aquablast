import "@/app/admin/checkout-admin.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { PLAIN_INPUT } from "@/components/admin/input-props";
import { deleteCompanyProduct, saveCompanyProduct } from "@/lib/admin/actions/company-products";
import { MIRRORED_PRODUCT_SLUGS } from "@/lib/admin/company-products-shared";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_COMPANY_ID, getCompanyById, listCompanyProducts, type Product } from "@/lib/companies";
import { CompanyNav } from "../../CompanyNav";

export const metadata = { title: "Produtos da empresa | Painel AquaBlast" };

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

function ProductFields({ companyId, product, mirrored }: { companyId: string; product?: Product; mirrored: boolean }) {
  return (
    <>
      <input type="hidden" name="companyId" value={companyId} />
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}
      <div className="grid-2">
        <label className="field">
          <span>Nome</span>
          <input name="name" defaultValue={product?.name ?? ""} maxLength={120} required />
        </label>
        <label className="field">
          <span>Slug{mirrored ? " (fixo)" : ""}</span>
          <input
            name="slug"
            defaultValue={product?.slug ?? ""}
            maxLength={60}
            required={!mirrored}
            readOnly={mirrored}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="boneca-grande"
            {...PLAIN_INPUT}
          />
        </label>
        <label className="field">
          <span>SKU (opcional)</span>
          <input name="sku" defaultValue={product?.sku ?? ""} maxLength={60} {...PLAIN_INPUT} />
        </label>
        <label className="field">
          <span>Posição (menor aparece primeiro)</span>
          <input name="position" type="number" min={0} max={10000} defaultValue={product?.position ?? 0} />
        </label>
        <label className="field">
          <span>Preço no Pix (R$)</span>
          <input name="pricePix" inputMode="decimal" defaultValue={product ? reais(product.pricePixCents) : ""} required readOnly={mirrored} placeholder="149,90" />
        </label>
        <label className="field">
          <span>Preço no cartão (R$)</span>
          <input name="priceCard" inputMode="decimal" defaultValue={product ? reais(product.priceCardCents) : ""} required readOnly={mirrored} placeholder="169,90" />
        </label>
        <label className="field span-2">
          <span>Imagem (URL https:// ou caminho local /…)</span>
          <input name="imageUrl" defaultValue={product?.imageUrl ?? ""} maxLength={500} placeholder="https://minha-loja.com/produto.jpg" {...PLAIN_INPUT} />
        </label>
        <label className="field span-2">
          <span>Descrição</span>
          <textarea name="description" rows={3} defaultValue={product?.description ?? ""} maxLength={2000} />
        </label>
      </div>
      {mirrored ? (
        <p className="small muted">
          O preço deste produto vem de <Link href="/admin/produtos">Produtos</Link> (preços do checkout atual do AquaBlast) e não muda aqui.
        </p>
      ) : null}
      <label className="check">
        <input type="checkbox" name="active" defaultChecked={product ? product.active : true} />
        <span>Produto ativo (aparece no checkout e na API)</span>
      </label>
    </>
  );
}

export default async function ProdutosEmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const company = await getCompanyById(id);
  if (!company) notFound();
  const list = await listCompanyProducts(company.id, false);
  const isDefault = company.id === DEFAULT_COMPANY_ID;

  return (
    <div className="stack">
      <CompanyNav company={company} current="produtos" />

      {isDefault ? (
        <section className="card callout">
          <p className="small">
            Os produtos <code>unit-azul</code>, <code>unit-vermelho</code>, <code>unit-preto</code> e <code>kit</code> espelham os preços de{" "}
            <Link href="/admin/produtos">Produtos</Link>: altere os valores lá. Aqui dá para mudar nome, imagem, descrição, posição e se estão ativos, e criar produtos novos para o checkout <code>/c/{company.slug}</code>.
          </p>
        </section>
      ) : null}

      <section className="card">
        <div className="card-head">
          <h2>Produtos ({list.length})</h2>
        </div>
        {list.length === 0 ? (
          <p className="small muted">Nenhum produto ainda. Cadastre o primeiro abaixo.</p>
        ) : (
          <div className="stack">
            {list.map((p) => {
              const mirrored = isDefault && MIRRORED_PRODUCT_SLUGS.includes(p.slug);
              return (
                <details key={p.id} className="card">
                  <summary>
                    <strong>{p.name}</strong> <span className="mono small">{p.slug}</span>{" "}
                    <span className={`badge tone-${p.active ? "green" : "gray"}`}>{p.active ? "Ativo" : "Inativo"}</span>{" "}
                    <span className="small muted">
                      Pix {brl(p.pricePixCents)} · Cartão {brl(p.priceCardCents)} · posição {p.position}
                    </span>
                  </summary>
                  <ActionForm action={saveCompanyProduct} key={p.updatedAt.getTime()}>
                    <ProductFields companyId={company.id} product={p} mirrored={mirrored} />
                    <div className="actions">
                      <button type="submit" className="btn btn-primary">
                        Salvar produto
                      </button>
                    </div>
                  </ActionForm>
                  {mirrored ? null : (
                    <ActionForm action={deleteCompanyProduct} confirm={`Apagar o produto "${p.name}"? Pedidos antigos não são afetados.`}>
                      <input type="hidden" name="companyId" value={company.id} />
                      <input type="hidden" name="productId" value={p.id} />
                      <div className="actions">
                        <button type="submit" className="btn btn-ghost danger">
                          Apagar produto
                        </button>
                      </div>
                    </ActionForm>
                  )}
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Novo produto</h2>
        </div>
        <p className="small muted">Valores em reais, com vírgula (ex.: 149,90). O preço do Pix precisa ser igual ou menor que o do cartão.</p>
        <ActionForm action={saveCompanyProduct}>
          <ProductFields companyId={company.id} mirrored={false} />
          <div className="actions">
            <button type="submit" className="btn btn-primary">
              Criar produto
            </button>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
