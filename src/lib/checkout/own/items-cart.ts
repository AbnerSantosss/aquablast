import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { checkoutCarts, products, type CartItem, type CheckoutCart, type Product } from "@/db/schema";
import { getCompanyById, getCompanyBySlug, type Company } from "@/lib/companies";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getCompanySetting } from "@/lib/settings";
import type { PayMethod, Quote } from "./pricing";
import { DEFAULT_SHIPPING_METHOD, shippingCentsFor, type ShippingMethod } from "./shipping";

/**
 * Carrinho com vários itens por empresa (multiempresa, 2026-10-13). Só servidor.
 * - Usado pela API v1 (`createItemsCart`) e pelo checkout por slug `/c/[slug]` (via upsertCart).
 * - O navegador/integração manda só `productSlug` + `quantity`. Preço, nome e sku vêm SEMPRE da tabela products.
 * - O carrinho de itens grava `pack = "items"` e `colors = []` (colunas NOT NULL do legado) e a lista em `items`.
 * - Na hora de pagar, `quoteItems` relê os preços atuais pelo productId: o snapshot do carrinho é só referência.
 */

export const ITEMS_PACK = "items";
export const MAX_ITEM_QUANTITY = 20;
export const MAX_CART_LINES = 20;

export type ItemsCartErrorCode = "company_not_found" | "company_inactive" | "empty_cart" | "too_many_items" | "invalid_quantity" | "product_not_found";

/** Erro de validação do carrinho de itens. `code` estável para a API mapear (404 empresa/produto, 400 o resto). */
export class ItemsCartError extends Error {
  readonly code: ItemsCartErrorCode;
  readonly productSlug?: string;
  constructor(code: ItemsCartErrorCode, message: string, productSlug?: string) {
    super(message);
    this.name = "ItemsCartError";
    this.code = code;
    this.productSlug = productSlug;
  }
}

export interface ItemsCartLineInput {
  productSlug: string;
  quantity: number;
}

export const isItemsCart = (cart: Pick<CheckoutCart, "pack" | "items"> | null | undefined): boolean =>
  !!cart && cart.pack === ITEMS_PACK && Array.isArray(cart.items) && cart.items.length > 0;

/** Empresa ativa pelo id ou slug; lança ItemsCartError se não existir ou estiver inativa. */
export async function activeCompanyOrThrow(ref: { id?: string; slug?: string }): Promise<Company> {
  const company = ref.id ? await getCompanyById(ref.id) : ref.slug ? await getCompanyBySlug(ref.slug) : null;
  if (!company) throw new ItemsCartError("company_not_found", "Empresa não encontrada.");
  if (!company.active) throw new ItemsCartError("company_inactive", "Empresa inativa.");
  return company;
}

function snapshot(p: Product, quantity: number): CartItem {
  return { productId: p.id, quantity, slug: p.slug, name: p.name, sku: p.sku ?? null, unitPixCents: p.pricePixCents, unitCardCents: p.priceCardCents };
}

/**
 * Valida e normaliza a lista: junta slugs repetidos, exige quantidade inteira 1..20, no máximo 20 linhas,
 * só produtos ATIVOS da empresa. Devolve os CartItem com o snapshot do catálogo, na ordem recebida.
 */
export async function resolveCartItems(companyId: string, items: readonly ItemsCartLineInput[]): Promise<CartItem[]> {
  if (!items.length) throw new ItemsCartError("empty_cart", "Carrinho vazio.");
  const merged = new Map<string, number>();
  for (const it of items) {
    const slug = String(it.productSlug ?? "").trim();
    const qty = Number(it.quantity);
    if (!slug) throw new ItemsCartError("product_not_found", "Produto sem slug.");
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_ITEM_QUANTITY) throw new ItemsCartError("invalid_quantity", `Quantidade inválida (1 a ${MAX_ITEM_QUANTITY}).`, slug);
    merged.set(slug, (merged.get(slug) ?? 0) + qty);
  }
  if (merged.size > MAX_CART_LINES) throw new ItemsCartError("too_many_items", `No máximo ${MAX_CART_LINES} produtos diferentes.`);
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.companyId, companyId), inArray(products.slug, [...merged.keys()]), eq(products.active, true)));
  const bySlug = new Map(rows.map((p) => [p.slug, p]));
  const out: CartItem[] = [];
  for (const [slug, qty] of merged) {
    const p = bySlug.get(slug);
    if (!p) throw new ItemsCartError("product_not_found", "Produto indisponível.", slug);
    if (qty > MAX_ITEM_QUANTITY) throw new ItemsCartError("invalid_quantity", `Quantidade inválida (1 a ${MAX_ITEM_QUANTITY}).`, slug);
    out.push(snapshot(p, qty));
  }
  return out;
}

export interface ItemsQuoteLine {
  productId: string;
  slug: string;
  name: string;
  sku: string | null;
  quantity: number;
  /** Preço unitário no método da cotação (Pix ou cartão), lido agora da tabela products. */
  unitCents: number;
  unitPixCents: number;
  unitCardCents: number;
}

export interface ItemsQuote extends Quote {
  lines: ItemsQuoteLine[];
}

/**
 * Cotação de um carrinho de itens, com os preços ATUAIS do catálogo (relidos pelo productId).
 * Produto apagado ou desativado depois de entrar no carrinho → ItemsCartError("product_not_found").
 * O objeto segue o formato de Quote (pack "unit" fictício, sem bump nem cupom) para reaproveitar a tela.
 */
export async function quoteItems(companyId: string, items: readonly CartItem[], method: PayMethod, installments = 1, shipping: ShippingMethod = DEFAULT_SHIPPING_METHOD): Promise<ItemsQuote> {
  if (!items.length) throw new ItemsCartError("empty_cart", "Carrinho vazio.");
  const ids = items.map((i) => i.productId);
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.companyId, companyId), inArray(products.id, ids), eq(products.active, true)));
  const byId = new Map(rows.map((p) => [p.id, p]));
  const lines: ItemsQuoteLine[] = items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new ItemsCartError("product_not_found", "Um produto do carrinho ficou indisponível.", i.slug);
    const quantity = Math.min(Math.max(1, Math.trunc(i.quantity)), MAX_ITEM_QUANTITY);
    return {
      productId: p.id,
      slug: p.slug,
      name: p.name,
      sku: p.sku ?? null,
      quantity,
      unitCents: method === "card" ? p.priceCardCents : p.pricePixCents,
      unitPixCents: p.pricePixCents,
      unitCardCents: p.priceCardCents,
    };
  });
  const productSubtotalCents = lines.reduce((s, l) => s + l.unitCents * l.quantity, 0);
  const shippingCents = shippingCentsFor(shipping);
  const amountCents = productSubtotalCents + shippingCents;
  const max = await getCompanySetting(companyId, "checkout.maxInstallments");
  const n = method === "card" ? Math.min(Math.max(1, Math.trunc(installments)), Math.max(1, max)) : 1;
  return {
    pack: "unit",
    method,
    productSubtotalCents,
    shippingMethod: shipping,
    shippingCents,
    amountCents,
    bumpDeltaCents: 0,
    bumpSavingCents: 0,
    installments: n,
    installmentCents: Math.round(amountCents / n),
    couponDiscountCents: 0,
    lines,
  };
}

/** Pix e cartão (o cartão com `installments`, como quoteBoth do legado). */
export async function quoteItemsBoth(companyId: string, items: readonly CartItem[], installments = 1, shipping: ShippingMethod = DEFAULT_SHIPPING_METHOD): Promise<{ pix: ItemsQuote; card: ItemsQuote }> {
  const [pix, card] = await Promise.all([quoteItems(companyId, items, "pix", 1, shipping), quoteItems(companyId, items, "card", installments, shipping)]);
  return { pix, card };
}

/** Título e sku consolidados (gateway que só aceita 1 item, logs). */
export function itemsTitle(lines: readonly Pick<ItemsQuoteLine, "name" | "quantity">[]): string {
  const t = lines.map((l) => (l.quantity > 1 ? `${l.quantity}x ${l.name}` : l.name)).join(" + ");
  return t.length > 120 ? `${t.slice(0, 117)}...` : t;
}

function checkoutUrlFor(slug: string, token: string): string {
  return `${env().APP_URL.replace(/\/+$/, "")}/c/${encodeURIComponent(slug)}?carrinho=${encodeURIComponent(token)}`;
}

/**
 * Cria um carrinho de itens para a empresa e devolve o link do checkout `/c/<slug>?carrinho=<token>`.
 * Preços vêm da tabela products (nunca do chamador). Lança ItemsCartError em entrada inválida.
 */
export async function createItemsCart({ companyId, items }: { companyId: string; items: { productSlug: string; quantity: number }[] }): Promise<{ cartId: string; checkoutUrl: string }> {
  const company = await activeCompanyOrThrow({ id: companyId });
  const cartItems = await resolveCartItems(company.id, items);
  const q = await quoteItems(company.id, cartItems, "pix");
  const token = randomToken(24);
  const [cart] = await db
    .insert(checkoutCarts)
    .values({
      companyId: company.id,
      token,
      status: "open",
      step: "dados",
      pack: ITEMS_PACK,
      colors: [],
      items: cartItems,
      bumpAccepted: false,
      shippingMethod: DEFAULT_SHIPPING_METHOD,
      amountCents: q.amountCents,
    })
    .returning({ id: checkoutCarts.id });
  return { cartId: cart.id, checkoutUrl: checkoutUrlFor(company.slug, token) };
}
