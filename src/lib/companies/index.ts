import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, DEFAULT_COMPANY_ID, products, type Company, type Product } from "@/db/schema";

/**
 * Empresas e catálogo do modo multiempresa (2026-10-12).
 * O AquaBlast é a empresa padrão (DEFAULT_COMPANY_ID, semeada pela migration 0013). Toda linha sem empresa
 * explícita cai nela. A API v1, o painel e o /c/[slug] usam estes helpers; o checkout legado não precisa.
 */
export { DEFAULT_COMPANY_ID };
export type { Company, Product };

export const isDefaultCompany = (companyId: string | null | undefined): boolean => !companyId || companyId === DEFAULT_COMPANY_ID;

/** companyId de uma linha (pedido, tentativa, carrinho) com fallback na empresa padrão. */
export const companyIdOf = (row: { companyId?: string | null } | null | undefined): string => row?.companyId || DEFAULT_COMPANY_ID;

export async function getCompanyById(id: string): Promise<Company | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await db.query.companies.findFirst({ where: eq(companies.id, id) })) ?? null;
}

export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  return (await db.query.companies.findFirst({ where: eq(companies.slug, slug) })) ?? null;
}

/** Empresa pelo SHA-256 (hex) da chave de API. Quem chama calcula o hash; a chave em claro nunca é gravada. */
export async function getCompanyByApiKeyHash(apiKeyHash: string): Promise<Company | null> {
  return (await db.query.companies.findFirst({ where: eq(companies.apiKeyHash, apiKeyHash) })) ?? null;
}

export async function listCompanies(): Promise<Company[]> {
  return db.select().from(companies).orderBy(asc(companies.createdAt));
}

/** Produtos da empresa na ordem de `position`. `onlyActive` (padrão) esconde os inativos. */
export async function listCompanyProducts(companyId: string, onlyActive = true): Promise<Product[]> {
  const where = onlyActive ? and(eq(products.companyId, companyId), eq(products.active, true)) : eq(products.companyId, companyId);
  return db.select().from(products).where(where).orderBy(asc(products.position), asc(products.createdAt));
}

export async function getCompanyProduct(companyId: string, idOrSlug: string): Promise<Product | null> {
  const byId = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const row = await db.query.products.findFirst({
    where: and(eq(products.companyId, companyId), byId ? eq(products.id, idOrSlug) : eq(products.slug, idOrSlug)),
  });
  return row ?? null;
}

/** Preços do AquaBlast (checkout.prices, em centavos) espelhados nos produtos unit-* e kit da empresa padrão. */
export async function mirrorDefaultCompanyPrices(prices: { unit: { pix: number; card: number }; kit: { pix: number; card: number } }): Promise<void> {
  const now = new Date();
  for (const slug of ["unit-azul", "unit-vermelho", "unit-preto"]) {
    await db
      .update(products)
      .set({ pricePixCents: prices.unit.pix, priceCardCents: prices.unit.card, updatedAt: now })
      .where(and(eq(products.companyId, DEFAULT_COMPANY_ID), eq(products.slug, slug)));
  }
  await db
    .update(products)
    .set({ pricePixCents: prices.kit.pix, priceCardCents: prices.kit.card, updatedAt: now })
    .where(and(eq(products.companyId, DEFAULT_COMPANY_ID), eq(products.slug, "kit")));
}
