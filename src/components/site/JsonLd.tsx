import { faq } from "@/data/faq";
import { reviews } from "@/data/reviews";
import { BASE_URL } from "@/lib/site/base-url";
import { BRAND_NAME, CHECKOUT_URL, PRICES } from "@/lib/site/constants";
import { reviewSummary } from "@/lib/site/reviews-summary";

const summary = reviewSummary(reviews);
const productImage = `${BASE_URL}/aquablast-hero.webp`;

const product = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "AquaBlast — Pistola de água elétrica com efeito luminoso",
  image: [productImage, `${BASE_URL}/produto-azul.webp`, `${BASE_URL}/produto-vermelho.webp`, `${BASE_URL}/produto-preto.webp`],
  description:
    "Pistola de água elétrica com efeito luminoso, bateria recarregável por USB e reservatório em tambor. Presente de Dia das Crianças disponível em 1 unidade (azul, vermelho ou preto) ou kit com 2 unidades.",
  brand: { "@type": "Brand", name: BRAND_NAME },
  color: ["Azul", "Vermelho", "Preto"],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: Number(summary.average.toFixed(1)),
    bestRating: 5,
    worstRating: 1,
    ratingCount: summary.count,
    reviewCount: summary.count,
  },
  offers: [
    {
      "@type": "Offer",
      name: "1 unidade AquaBlast",
      price: PRICES.unit.amount.toFixed(2),
      priceCurrency: "BRL",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url: CHECKOUT_URL,
      eligibleQuantity: { "@type": "QuantitativeValue", value: 1, unitText: "unidade" },
    },
    {
      "@type": "Offer",
      name: "Kit com 2 AquaBlast",
      price: PRICES.kit.amount.toFixed(2),
      priceCurrency: "BRL",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url: CHECKOUT_URL,
      eligibleQuantity: { "@type": "QuantitativeValue", value: 2, unitText: "unidades" },
    },
  ],
};

const faqPage = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: BRAND_NAME,
  url: `${BASE_URL}/`,
  logo: `${BASE_URL}/icons/droplets.svg`,
  email: "contato@aquablast.com.br",
  slogan: "Diversão que aproxima",
};

const webSite = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: BRAND_NAME,
  url: `${BASE_URL}/`,
  inLanguage: "pt-BR",
};

const serialize = (data: object) => JSON.stringify(data).replace(/</g, "\\u003c");

export function JsonLd() {
  return (
    <>
      {[product, faqPage, organization, webSite].map((data) => (
        <script key={data["@type"]} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialize(data) }} />
      ))}
    </>
  );
}
