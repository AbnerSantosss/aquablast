import { BASE_URL } from "@/lib/site/base-url";
import { PRICES, RETURNS_PATH } from "@/lib/site/constants";

/**
 * Constantes de SEO do site público (title, description, Open Graph, schema,
 * sitemap). Tudo que é fato comercial vem de `constants.ts` (preços) para não
 * divergir do que a página mostra.
 */

/** Origem sem barra final. */
export const SITE_URL = BASE_URL.replace(/\/+$/, "");

/**
 * URL da home exatamente como o Next renderiza na `<link rel="canonical">`
 * (`alternates.canonical: "/"` sai sem barra final). O sitemap, o `og:url`
 * implícito e o schema usam esta mesma string.
 */
export const HOME_URL = SITE_URL;

/** URL absoluta de um caminho do site (`/og-aquablast.jpg` -> `https://.../og-aquablast.jpg`). */
export const absoluteUrl = (path: string): string => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** Title da home (57 caracteres): termo principal no início, marca no fim. */
export const SEO_TITLE = "Pistola de água elétrica recarregável com LED | AquaBlast";

/** Title de compartilhamento (WhatsApp, Facebook, X): pode ser mais longo que o da SERP. */
export const OG_TITLE = "AquaBlast: pistola de água elétrica recarregável com luz LED";

// Campanha sazonal: trocar ou apagar (string vazia) depois de 12/10.
export const CAMPAIGN = "Presente de Dia das Crianças";

const OFFER_LINE = `1 unidade por ${PRICES.unit.pix} ou kit com 2 por ${PRICES.kit.pix}.`;

/** Meta description (~157 caracteres com os preços de hoje). Sem CAMPAIGN, a frase continua correta. */
export const SEO_DESCRIPTION = `Pistola de água elétrica com luz LED, recarga USB e reservatório em tambor. ${
  CAMPAIGN ? `${CAMPAIGN}: ` : ""
}${OFFER_LINE}`;

// Data da última mudança de conteúdo da home (AAAA-MM-DD). Vai para o <lastmod>
// do sitemap e o dateModified do schema. Atualize quando mudar texto, preço ou oferta.
export const CONTENT_UPDATED_AT = "2026-09-26";

// aggregateRating no Product: o dono confirmou em 2026-09-26 que as avaliações de
// src/data/reviews.ts são de clientes reais. Nota e total saem de reviewSummary(),
// os mesmos números que a página mostra. Se entrar avaliação sem origem confirmada,
// desligar. Ver wiki/conteudo/honestidade-e-confirmar.md.
export const SHOW_AGGREGATE_RATING: boolean = true;

// Opção "Frete grátis" configurada na Zedy em 2026-09-23 e banner do checkout
// "Frete grátis para todo o Brasil". Ver wiki/operacao/aquablast-checkout-zedy.md.
// Se o frete mudar, desligar. Prazo de entrega NÃO entra no schema (não confirmado).
export const FREE_SHIPPING_BR: boolean = true;

/** Imagem de compartilhamento (JPG 1200x630 < 300 KB, feita das fotos oficiais). */
export const OG_IMAGE = {
  url: "/og-aquablast.jpg",
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "Pistola de água elétrica AquaBlast nas cores azul, vermelho e preto",
};

/** Logo da Organization no schema (PNG 512x512 rastreável; o Google não usa data: URI nem SVG aqui). */
export const ORG_LOGO = "/icon-512.png";

// ---------------------------------------------------------------------------
// Política de trocas e devoluções (src/app/(site)/trocas-e-devolucoes)
// Regra da loja dada pelo dono em 2026-09-26: produto que chegar quebrado ou
// avariado é substituído sem custo para o cliente; na desistência dentro do
// prazo legal, o frete de devolução também é por conta da AquaBlast (dono
// confirmou em 2026-09-26). O resto vem da lei (CDC, Lei 8.078/1990). Sem
// prazo interno, prazo de reembolso ou endereço: não confirmados.
// ---------------------------------------------------------------------------

/** Prazo de arrependimento em compra fora do estabelecimento, a contar do recebimento: art. 49 do CDC. */
export const RETURN_POLICY_DAYS = 7;

/** URL absoluta da política, igual à `<link rel="canonical">` renderizada da página (sem barra final). */
export const RETURNS_URL = absoluteUrl(RETURNS_PATH);

/** Title da página (43 caracteres). */
export const RETURNS_TITLE = "Política de trocas e devoluções | AquaBlast";

/** Meta description da página (153 caracteres): cita o frete de devolução por nossa conta. */
export const RETURNS_DESCRIPTION = `Chegou quebrado ou com defeito? A AquaBlast envia outro sem custo. Na desistência da compra em até ${RETURN_POLICY_DAYS} dias, o frete de devolução também é por nossa conta.`;

// Data da última mudança do texto da política (AAAA-MM-DD). Vai para a linha
// "Atualizada em", o <lastmod> do sitemap e o dateModified do schema da página.
export const RETURNS_UPDATED_AT = "2026-09-26";
