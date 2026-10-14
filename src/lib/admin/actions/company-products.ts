"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { DEFAULT_COMPANY_ID, products } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { actorOf, audit } from "@/lib/admin/audit";
import { bool, int, optStr, str } from "@/lib/admin/form";
import { fail, ok, type ActionResult } from "@/lib/admin/types";
import { MIRRORED_PRODUCT_SLUGS } from "@/lib/admin/company-products-shared";
import { getCompanyById } from "@/lib/companies";

/**
 * CRUD de produtos por empresa (gateway multiempresa, agente P).
 * Coerência com `savePricesSettings` (painel > Produtos): no AquaBlast, os produtos `unit-azul`, `unit-vermelho`,
 * `unit-preto` e `kit` têm o preço espelhado de `checkout.prices`. Aqui eles NÃO aceitam mudar preço, slug nem
 * serem apagados: o preço continua sendo editado em /admin/produtos (senão o espelho e o checkout legado divergiriam).
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CENTS = 100_000_000; // R$ 1.000.000,00: só pega erro de digitação

async function begin() {
  const session = await requireAdmin();
  await ensureBootstrap();
  return { actor: actorOf(session) };
}

/** "159,90" ou "1.159,90" -> centavos; null se inválido. */
function centsField(fd: FormData, name: string): number | null {
  const raw = fd.get(name);
  if (typeof raw !== "string" || !raw.trim()) return null;
  const n = Number(raw.trim().replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Imagem por URL: https:// ou caminho local começando com uma única barra. */
function validImage(v: string): boolean {
  if (v.startsWith("/")) return !v.startsWith("//") && !/[\s<>"]/.test(v);
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

function revalidateCatalog(companyId: string, slug?: string) {
  revalidatePath(`/admin/empresas/${companyId}/produtos`);
  revalidatePath(`/admin/empresas/${companyId}`);
  if (slug) revalidatePath(`/c/${slug}`);
}

/** Cria (sem productId) ou atualiza (com productId) um produto da empresa. */
export async function saveCompanyProduct(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const company = await getCompanyById(str(fd, "companyId", 64));
  if (!company) return fail("Empresa não encontrada.");
  const productId = str(fd, "productId", 64);
  const existing = productId ? await db.query.products.findFirst({ where: and(eq(products.id, productId), eq(products.companyId, company.id)) }) : null;
  if (productId && !existing) return fail("Produto não encontrado.");
  const mirrored = company.id === DEFAULT_COMPANY_ID && Boolean(existing) && MIRRORED_PRODUCT_SLUGS.includes(existing?.slug ?? "");

  const name = str(fd, "name", 120);
  if (name.length < 2) return fail("Informe o nome do produto.");
  const description = str(fd, "description", 2000);
  const sku = optStr(fd, "sku", 60);
  const imageUrl = optStr(fd, "imageUrl", 500);
  if (imageUrl && !validImage(imageUrl)) return fail("Imagem: use uma URL https:// ou um caminho local que comece com /.");
  const active = bool(fd, "active");
  const position = int(fd, "position", 0, 0, 10_000);

  const slug = mirrored && existing ? existing.slug : str(fd, "slug", 60).toLowerCase();
  if (!SLUG_RE.test(slug) || slug.length < 2) return fail("Slug inválido: use letras minúsculas, números e hífens (ex.: boneca-grande).");
  const dup = await db.query.products.findFirst({
    where: existing
      ? and(eq(products.companyId, company.id), eq(products.slug, slug), ne(products.id, existing.id))
      : and(eq(products.companyId, company.id), eq(products.slug, slug)),
    columns: { id: true },
  });
  if (dup) return fail("Já existe um produto com esse slug nesta empresa.");

  let pricePixCents: number;
  let priceCardCents: number;
  if (mirrored && existing) {
    // Preço vem de checkout.prices (painel > Produtos): ignora o que veio no formulário.
    pricePixCents = existing.pricePixCents;
    priceCardCents = existing.priceCardCents;
  } else {
    const pix = centsField(fd, "pricePix");
    const card = centsField(fd, "priceCard");
    if (pix === null || card === null) return fail("Informe os dois preços com valores válidos (ex.: 149,90).");
    if (pix > card) return fail("O preço no Pix não pode ser maior que no cartão.");
    if (card > MAX_CENTS) return fail("Valor muito alto — confira se não faltou uma vírgula.");
    pricePixCents = pix;
    priceCardCents = card;
  }

  if (existing) {
    await db
      .update(products)
      .set({ slug, sku, name, description, imageUrl, pricePixCents, priceCardCents, active, position, updatedAt: new Date() })
      .where(eq(products.id, existing.id));
    await audit(actor, "company.product.update", { type: "product", id: existing.id }, { companyId: company.id, slug, pricePixCents, priceCardCents, active });
    revalidateCatalog(company.id, company.slug);
    return ok(mirrored ? "Produto salvo. O preço dele vem de Produtos (painel) e não foi alterado aqui." : "Produto salvo.");
  }

  const [row] = await db
    .insert(products)
    .values({ companyId: company.id, slug, sku, name, description, imageUrl, pricePixCents, priceCardCents, active, position })
    .returning({ id: products.id });
  await audit(actor, "company.product.create", { type: "product", id: row.id }, { companyId: company.id, slug, pricePixCents, priceCardCents });
  revalidateCatalog(company.id, company.slug);
  return ok("Produto criado.");
}

export async function deleteCompanyProduct(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const company = await getCompanyById(str(fd, "companyId", 64));
  if (!company) return fail("Empresa não encontrada.");
  const productId = str(fd, "productId", 64);
  const existing = await db.query.products.findFirst({ where: and(eq(products.id, productId), eq(products.companyId, company.id)) });
  if (!existing) return fail("Produto não encontrado.");
  if (company.id === DEFAULT_COMPANY_ID && MIRRORED_PRODUCT_SLUGS.includes(existing.slug)) {
    return fail("Este produto do AquaBlast alimenta o checkout atual e não pode ser apagado. Desative-o se não quiser mais vendê-lo.");
  }
  // Carrinhos e pedidos guardam uma cópia (nome, preço) dos itens, então apagar não quebra o histórico.
  await db.delete(products).where(eq(products.id, existing.id));
  await audit(actor, "company.product.delete", { type: "product", id: existing.id }, { companyId: company.id, slug: existing.slug });
  revalidateCatalog(company.id, company.slug);
  return ok("Produto apagado.");
}
