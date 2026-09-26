import { faq } from "@/data/faq";
import { reviews } from "@/data/reviews";
import { BRAND_NAME, CONTACT_EMAIL, PRICES } from "@/lib/site/constants";
import { reviewSummary } from "@/lib/site/reviews-summary";
import {
  absoluteUrl,
  CONTENT_UPDATED_AT,
  FREE_SHIPPING_BR,
  HOME_URL,
  OG_IMAGE,
  ORG_LOGO,
  RETURN_POLICY_DAYS,
  RETURNS_URL,
  SEO_DESCRIPTION,
  SEO_TITLE,
  SHOW_AGGREGATE_RATING,
  SITE_URL,
} from "@/lib/site/seo";
import type { SupportWhatsapp } from "@/lib/site/support-contact";

/**
 * Um único JSON-LD com `@graph`: as entidades se referenciam por `@id` estável
 * (derivado da URL canônica), sem blocos soltos e sem ambiguidade.
 * Regras de honestidade: e-mail (contactPoint) confirmado pelo dono em 2026-09-26;
 * `contactPoint.telephone` só quando o dono cadastra o WhatsApp no painel (sem
 * cadastro o nó fica sem telefone); sem endereço ou sameAs na Organization (não
 * confirmados); sem prazo de
 * entrega na Offer; política de trocas com o prazo da lei (art. 49 do CDC) e com
 * `returnFees: FreeReturn`, porque o dono confirmou em 2026-09-26 que a loja paga o
 * frete de devolução na desistência; ainda SEM returnPolicyCountry nem
 * returnShippingFeesAmount (endereço de devolução não confirmado);
 * `aggregateRating` só com SHOW_AGGREGATE_RATING (ver src/lib/site/seo.ts).
 */
const ID = {
  organization: `${SITE_URL}/#organization`,
  website: `${SITE_URL}/#website`,
  webpage: `${SITE_URL}/#webpage`,
  product: `${SITE_URL}/#product`,
  faq: `${SITE_URL}/#faq`,
  returnPolicy: `${SITE_URL}/#politica-de-trocas`,
} as const;

const ref = (id: string) => ({ "@id": id });

const organizationBase = {
  "@type": "Organization",
  "@id": ID.organization,
  name: BRAND_NAME,
  url: HOME_URL,
  logo: {
    "@type": "ImageObject",
    url: absoluteUrl(ORG_LOGO),
    contentUrl: absoluteUrl(ORG_LOGO),
    width: 512,
    height: 512,
  },
  slogan: "Diversão que aproxima",
  email: CONTACT_EMAIL,
};

// telephone só com o WhatsApp cadastrado no painel (nunca o default do código).
const organizationNode = (telephone: string | null) => ({
  ...organizationBase,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer service",
    email: CONTACT_EMAIL,
    ...(telephone ? { telephone } : {}),
    areaServed: "BR",
    availableLanguage: "pt-BR",
  },
  hasMerchantReturnPolicy: ref(ID.returnPolicy),
});

// Mesma política da página /trocas-e-devolucoes. returnFees: FreeReturn porque
// o dono confirmou em 2026-09-26 que a loja paga o frete de devolução na
// desistência. Ainda sem returnPolicyCountry (endereço de devolução não
// confirmado) nem returnShippingFeesAmount (não se aplica: o frete é grátis).
const merchantReturnPolicy = {
  "@type": "MerchantReturnPolicy",
  "@id": ID.returnPolicy,
  name: "Política de trocas e devoluções",
  url: RETURNS_URL,
  applicableCountry: "BR",
  returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
  merchantReturnDays: RETURN_POLICY_DAYS,
  returnMethod: "https://schema.org/ReturnByMail",
  returnFees: "https://schema.org/FreeReturn",
};

const webSite = {
  "@type": "WebSite",
  "@id": ID.website,
  name: BRAND_NAME,
  url: HOME_URL,
  inLanguage: "pt-BR",
  publisher: ref(ID.organization),
};

const webPage = {
  "@type": "WebPage",
  "@id": ID.webpage,
  url: HOME_URL,
  name: SEO_TITLE,
  description: SEO_DESCRIPTION,
  isPartOf: ref(ID.website),
  about: ref(ID.product),
  mainEntity: ref(ID.product),
  primaryImageOfPage: {
    "@type": "ImageObject",
    url: absoluteUrl(OG_IMAGE.url),
    contentUrl: absoluteUrl(OG_IMAGE.url),
    width: OG_IMAGE.width,
    height: OG_IMAGE.height,
    caption: OG_IMAGE.alt,
  },
  inLanguage: "pt-BR",
  dateModified: CONTENT_UPDATED_AT,
};

// Frete grátis para o Brasil (opção do checkout). Sem deliveryTime/handlingTime: prazo não confirmado.
const shippingDetails = {
  "@type": "OfferShippingDetails",
  shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "BRL" },
  shippingDestination: { "@type": "DefinedRegion", addressCountry: "BR" },
};

const offerCommon = {
  "@type": "Offer",
  priceCurrency: "BRL",
  availability: "https://schema.org/InStock",
  itemCondition: "https://schema.org/NewCondition",
  // A página canônica, não o checkout: é a URL que o Google pode rastrear e indexar.
  url: HOME_URL,
  seller: ref(ID.organization),
  ...(FREE_SHIPPING_BR ? { shippingDetails } : {}),
  hasMerchantReturnPolicy: ref(ID.returnPolicy),
};

const summary = reviewSummary(reviews);
const aggregateRating = {
  "@type": "AggregateRating",
  ratingValue: Number(summary.average.toFixed(1)),
  bestRating: 5,
  worstRating: 1,
  ratingCount: summary.count,
  reviewCount: summary.count,
};

const product = {
  "@type": "Product",
  "@id": ID.product,
  name: "AquaBlast — Pistola de água elétrica com efeito luminoso",
  image: [
    absoluteUrl("/aquablast-hero.webp"),
    absoluteUrl("/produto-azul.webp"),
    absoluteUrl("/produto-vermelho.webp"),
    absoluteUrl("/produto-preto.webp"),
  ],
  description:
    "Pistola de água elétrica com efeito luminoso, bateria recarregável por USB e reservatório em tambor. Presente de Dia das Crianças disponível em 1 unidade (azul, vermelho ou preto) ou kit com 2 unidades.",
  brand: { "@type": "Brand", name: BRAND_NAME },
  color: ["Azul", "Vermelho", "Preto"],
  offers: [
    {
      ...offerCommon,
      name: "1 unidade AquaBlast",
      price: PRICES.unit.amount.toFixed(2),
      eligibleQuantity: { "@type": "QuantitativeValue", value: 1, unitText: "unidade" },
    },
    {
      ...offerCommon,
      name: "Kit com 2 AquaBlast",
      price: PRICES.kit.amount.toFixed(2),
      eligibleQuantity: { "@type": "QuantitativeValue", value: 2, unitText: "unidades" },
    },
  ],
  ...(SHOW_AGGREGATE_RATING ? { aggregateRating } : {}),
};

const faqPage = {
  "@type": "FAQPage",
  "@id": ID.faq,
  isPartOf: ref(ID.webpage),
  inLanguage: "pt-BR",
  mainEntity: faq.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

const buildGraph = (telephone: string | null) => ({
  "@context": "https://schema.org",
  "@graph": [organizationNode(telephone), webSite, webPage, product, faqPage, merchantReturnPolicy],
});

// `<` vira < para o conteúdo nunca fechar a tag <script> (guia JSON-LD do Next).
const serialize = (data: object) => JSON.stringify(data).replace(/</g, "\\u003c");

/** Um `<script type="application/ld+json">` com o escape acima. Usado também por outras páginas do site. */
export function JsonLdScript({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialize(data) }} />;
}

/** JSON-LD da home. `whatsapp` vem do painel (getSupportWhatsapp); null = sem telefone. */
export function JsonLd({ whatsapp = null }: { whatsapp?: SupportWhatsapp | null }) {
  return <JsonLdScript data={buildGraph(whatsapp ? whatsapp.telephone : null)} />;
}
