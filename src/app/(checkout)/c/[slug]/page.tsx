import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Checkout } from "@/components/checkout/Checkout";
import { ensureBootstrap } from "@/lib/bootstrap";
import { getCartByToken } from "@/lib/checkout/own/cart";
import { isItemsCart } from "@/lib/checkout/own/items-cart";
import { loadItemsCheckoutProps } from "@/lib/checkout/own/items-checkout";
import { DEFAULT_COMPANY_ID, getCompanyBySlug } from "@/lib/companies";
import { deliveryPromiseText } from "@/lib/site/delivery-promise";
import type { Company } from "@/db/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** Empresa ativa pelo slug da URL; inexistente, inativa ou slug malformado = null (a página vira 404). */
async function activeCompany(slug: string): Promise<Company | null> {
  if (!SLUG.test(slug)) return null;
  const company = await getCompanyBySlug(slug);
  return company && company.active ? company : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  await ensureBootstrap();
  const company = await activeCompany(slug);
  return company ? { title: `${company.name} | Finalize seu pedido`, description: `Checkout ${company.name}.` } : {};
}

/**
 * /c/[slug] — checkout por itens de uma empresa (multiempresa, 2026-10-13). Fica no grupo (checkout) para herdar o
 * layout (CSS e fontes do checkout); a URL pública é `/c/<slug>`. Lista os produtos ativos da empresa com quantidade,
 * usa o tema e os gateways da empresa. `?carrinho=<token>`: carrinho de itens criado pela API v1 (`createItemsCart`)
 * ou retomado; só vale se for da mesma empresa e não estiver pago. Empresa inexistente/inativa ou sem produto ativo: 404.
 * O `/checkout?pack=` legado não passa por aqui.
 */
export default async function CompanyCheckoutPage({ params, searchParams }: Params) {
  await ensureBootstrap();
  const { slug } = await params;
  const company = await activeCompany(slug);
  if (!company) notFound();

  const query = await searchParams;
  const raw = Array.isArray(query.carrinho) ? query.carrinho[0] : query.carrinho;
  const found = raw && /^[A-Za-z0-9_-]{8,80}$/.test(raw) ? await getCartByToken(raw) : null;
  const cart = found && isItemsCart(found) && found.companyId === company.id && found.status !== "converted" && found.status !== "recovered" ? found : null;

  const { props, itemsMode, initial } = await loadItemsCheckoutProps(company, cart);
  if (!itemsMode.products.length) notFound();

  return (
    <Checkout
      {...props}
      // Marcador exigido pelo tipo; no modo itens o `<Checkout />` não usa pack nem cor.
      selection={{ pack: "unit", colors: ["azul"] }}
      itemsMode={itemsMode}
      initial={initial}
      // Aviso de prazo de entrega é do AquaBlast (lib/site/delivery-promise.ts); outra empresa não herda.
      deliveryPromise={company.id === DEFAULT_COMPANY_ID ? deliveryPromiseText() : null}
    />
  );
}
