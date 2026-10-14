import type { CheckoutCart, Company } from "@/db/schema";
import { listCompanyProducts } from "@/lib/companies";
import { gatewayFor } from "@/lib/gateways";
import { errorMessage, log } from "@/lib/log";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { companySettingKey, getCompanySettings, getSetting } from "@/lib/settings";
import { CONTACT_EMAIL } from "@/lib/site/constants";
import { getSupportWhatsapp, toSupportWhatsapp } from "@/lib/site/support-contact";
import type { CheckoutReview } from "@/components/checkout/CheckoutReviews";
import type { ItemsCatalogProduct, ItemsLine, ItemsModeProps } from "@/components/checkout/items-types";
import type { CheckoutServerProps } from "./checkout-props";
import { isItemsCart, quoteItemsBoth, type ItemsQuote } from "./items-cart";
import type { CheckoutInitial, StepName } from "@/components/checkout/types";
import { maskedDocument } from "@/lib/orders/service";
import { isColor, photosOfSku } from "./catalog";
import { maskCEP, maskPhone } from "./masks";
import { listActiveCheckoutReviews } from "./reviews";
import { shippingMethodOf } from "./shipping";
import { getTheme } from "./theme-server";

/**
 * Props do `<Checkout />` no modo itens (`/c/[slug]`, multiempresa 2026-10-13). Só servidor.
 * Tudo da empresa: tema, gateways (getCompanySetting), parcelas, validade do Pix, comentários.
 * Sem bump, sem cupom e sem artes de banner (as artes do painel são do AquaBlast por produto unit/kit).
 */

async function loadReviews(companyId: string): Promise<CheckoutReview[]> {
  try {
    return await listActiveCheckoutReviews(companyId);
  } catch (err) {
    log.error("checkout /c: leitura dos comentários falhou", { error: errorMessage(err) });
    return [];
  }
}

/**
 * Monta as props. `cart`: carrinho de itens retomado (`?carrinho=`) da mesma empresa; sem ele, começa com o
 * 1º produto ativo e quantidade 1. Empresa sem produto ativo → `products` vazio (a página trata como 404).
 */
export async function loadItemsCheckoutProps(company: Company, cart: CheckoutCart | null): Promise<{ props: CheckoutServerProps; itemsMode: ItemsModeProps; initial: CheckoutInitial | undefined }> {
  const s = await getCompanySettings(company.id, ["checkout.maxInstallments", "checkout.pixTtlSeconds", "checkout.cardComingSoon"] as const);
  const consentRequired = await getSetting("ads.consentRequired");
  const maxInstallments = Math.max(1, Math.min(12, Math.trunc(s["checkout.maxInstallments"])));
  const rows = await listCompanyProducts(company.id, true);
  const products: ItemsCatalogProduct[] = rows.map((p) => ({ slug: p.slug, name: p.name, description: p.description ?? null, imageUrl: p.imageUrl ?? thumbOfSku(p.sku) ?? photosOfSku(p.sku)[0]?.src ?? null, pricePixCents: p.pricePixCents, priceCardCents: p.priceCardCents }));

  const resumed = cart && isItemsCart(cart) && cart.companyId === company.id && cart.items ? cart.items : null;
  const activeSlugs = new Set(products.map((p) => p.slug));
  let initialItems: ItemsLine[] = (resumed ?? [])
    .filter((i) => i.slug && activeSlugs.has(i.slug))
    .map((i) => ({ productSlug: i.slug as string, quantity: Math.max(1, Math.min(20, Math.trunc(i.quantity))) }));
  if (!initialItems.length && products.length) initialItems = [{ productSlug: products[0].slug, quantity: 1 }];

  const [pixGw, cardGw] = await Promise.all([gatewayFor("pix", company.id), gatewayFor("card", company.id)]);
  const [theme, support, checkoutReviews] = await Promise.all([getTheme(company.id, company.name), supportForCompany(company.id), loadReviews(company.id)]);
  const cardPublicConfig = cardGw ? await cardGw.publicConfig({ companyId: company.id }) : {};

  const methods: ("pix" | "card")[] = [];
  if (pixGw) methods.push("pix");
  const cardPending = !cardGw && !!pixGw && s["checkout.cardComingSoon"];
  if (cardGw || cardPending) methods.push("card");

  // Cotação inicial com os preços atuais (mesma regra do servidor no pagamento).
  const bySlug = new Map(rows.map((p) => [p.slug, p]));
  const cartItems = initialItems.flatMap((l) => {
    const p = bySlug.get(l.productSlug);
    return p ? [{ productId: p.id, quantity: l.quantity, slug: p.slug }] : [];
  });
  const quotes = cartItems.length ? await quoteItemsBoth(company.id, cartItems, maxInstallments, shippingMethodOf(cart?.shippingMethod)) : null;

  const props: CheckoutServerProps = {
    theme,
    methods,
    maxInstallments,
    pixTtlSeconds: s["checkout.pixTtlSeconds"],
    bumpEnabled: false,
    pixGateway: pixGw?.name ?? null,
    cardGateway: cardGw?.name ?? null,
    cardPublicConfig,
    cardPending,
    // Sem produto ativo a página devolve 404 antes de usar isto; o fallback só satisfaz o tipo.
    quotesInitial: quotes ?? { pix: emptyQuote("pix"), card: emptyQuote("card") },
    coupon: "",
    support,
    consentRequired: consentRequired !== false,
    checkoutReviews,
    checkoutBanners: {},
  };
  const initial = resumed && cart ? initialFromItemsCart(cart) : undefined;
  return { props, itemsMode: { companySlug: company.slug, companyName: company.name, products, initialItems }, initial };
}

/** Miniatura 110px da cor (mesma do resumo do /checkout) para os produtos unit-* do AquaBlast. */
function thumbOfSku(sku: string | null): string | null {
  const m = /^AQB-1UN-([A-Z]+)$/.exec(sku ?? "");
  const c = m?.[1].toLowerCase();
  return c && isColor(c) ? `/thumbs/produto-${c}-110.webp` : null;
}

const DEFAULT_COMPANY = "00000000-0000-4000-8000-000000000001";

/** Valor próprio de `company:<id>:<chave>` em texto (sem herdar o global do AquaBlast). */
async function ownText(companyId: string, key: "store.supportWhatsapp" | "store.supportEmail"): Promise<string> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, companySettingKey(companyId, key)) });
  if (!row || row.encrypted) return "";
  const v = row.value;
  return typeof v === "string" ? v.trim() : typeof v === "number" && Number.isSafeInteger(v) ? String(v) : "";
}

/**
 * Atendimento: AquaBlast = WhatsApp global (ou e-mail de contato), como no /checkout. Outra empresa = só o que ela
 * gravou (`store.supportWhatsapp` / `store.supportEmail`); sem nada, href vazio e o link some (Footer/HelpFact).
 */
export async function supportForCompany(companyId: string): Promise<{ href: string; external: boolean }> {
  if (companyId === DEFAULT_COMPANY) {
    const whatsapp = await getSupportWhatsapp();
    return whatsapp ? { href: whatsapp.href, external: true } : { href: `mailto:${CONTACT_EMAIL}`, external: false };
  }
  const wa = toSupportWhatsapp(await ownText(companyId, "store.supportWhatsapp"));
  if (wa) return { href: wa.href, external: true };
  const email = await ownText(companyId, "store.supportEmail");
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? { href: `mailto:${email}`, external: false } : { href: "", external: false };
}

function emptyQuote(method: "pix" | "card"): ItemsQuote {
  return {
    pack: "unit",
    method,
    productSubtotalCents: 0,
    shippingMethod: "free",
    shippingCents: 0,
    amountCents: 0,
    bumpDeltaCents: 0,
    bumpSavingCents: 0,
    installments: 1,
    installmentCents: 0,
    couponDiscountCents: 0,
    lines: [],
  };
}

/** Etapa em que o carrinho retomado abre (mesma regra de /checkout/pedido/[token]): nunca pula dado que falta. */
function resumeStep(cart: CheckoutCart): StepName {
  const hasCustomer = !!(cart.customerName && cart.customerEmail && cart.customerPhone);
  const hasAddress = !!(cart.addressLine1 && cart.addressNumber && cart.addressCity && cart.addressState && cart.addressPostalCode);
  if (!hasCustomer) return "dados";
  if (!hasAddress) return cart.step === "dados" ? "dados" : "entrega";
  if (cart.step === "dados") return "dados";
  if (cart.step === "entrega") return "entrega";
  return "pagamento";
}

/** Carrinho de itens retomado (`?carrinho=`, link da API v1): dados gravados, CPF só mascarado, sem bump. */
function initialFromItemsCart(cart: CheckoutCart): CheckoutInitial {
  return {
    cartToken: cart.token,
    step: resumeStep(cart),
    customer: { name: cart.customerName ?? "", email: cart.customerEmail ?? "", phone: maskPhone(cart.customerPhone ?? ""), cpf: "" },
    cpfMasked: maskedDocument(cart.customerDocumentEnc),
    address: {
      cep: maskCEP(cart.addressPostalCode ?? ""),
      street: cart.addressLine1 ?? "",
      number: cart.addressNumber ?? "",
      extra: cart.addressLine2 ?? "",
      district: cart.addressNeighborhood ?? "",
      city: cart.addressCity ?? "",
      state: cart.addressState ?? "",
      recipient: cart.recipient ?? cart.customerName ?? "",
    },
    bump: false,
    shipping: shippingMethodOf(cart.shippingMethod),
    bumpColor: null,
  };
}
