import type { Color, Pack } from "@/lib/site/types";

// Checkout Zedy: loja 38320, dominio seguro.aquablastbrasil.com.br.
// Um link por variante (cada cor da unidade e cada combinacao do kit), para que
// a escolha feita no site chegue ao pagamento. Os codigos vem do admin da Zedy,
// "Copiar link de Compra" de cada variante (produtos 26555142 e 26555165).
const CHECKOUT_BASE = "https://seguro.aquablastbrasil.com.br/api/public/shopify";
const CHECKOUT_STORE = "38320";

const UNIT_CHECKOUT: Record<Color, string> = {
  azul: "3832091532428",
  vermelho: "3832089171556",
  preto: "3832073618985",
};

// [primeiro brinquedo][segundo brinquedo]
const KIT_CHECKOUT: Record<Color, Record<Color, string>> = {
  azul: { azul: "3832082498171", vermelho: "3832061937543", preto: "3832042128844" },
  vermelho: { azul: "3832056938296", vermelho: "3832034987449", preto: "3832058556951" },
  preto: { azul: "3832083966525", vermelho: "3832088592283", preto: "3832017287217" },
};

export function checkoutUrl(pack: Pack, color: Color, kitColors: readonly [Color, Color]): string {
  const product = pack === "kit" ? KIT_CHECKOUT[kitColors[0]][kitColors[1]] : UNIT_CHECKOUT[color];
  return `${CHECKOUT_BASE}?product=${product}&store=${CHECKOUT_STORE}`;
}

/**
 * Caminho do checkout PRÓPRIO (/checkout) para a mesma escolha que `checkoutUrl` manda para a Zedy.
 * Usado pelo PurchaseLink quando `checkout.mode === "proprio"` (plano 8.8/8.9). Relativo, sem domínio.
 */
export function ownCheckoutPath(pack: Pack, color: Color, kitColors: readonly [Color, Color]): string {
  return pack === "kit" ? `/checkout?pack=kit&cor1=${kitColors[0]}&cor2=${kitColors[1]}` : `/checkout?pack=unit&cor=${color}`;
}

/**
 * Link da Zedy a partir de uma seleção já montada ({ pack, colors }), o mesmo formato de
 * `selectionFromParams` em @/lib/checkout/own/catalog. Serve para o /checkout redirecionar para a Zedy
 * quando `checkout.mode` for "zedy" (compatibilidade). Tipado por estrutura para não importar o catálogo.
 */
export function zedyUrlFromSelection(sel: { pack: Pack; colors: readonly Color[] }): string {
  const c1 = sel.colors[0] ?? "azul";
  const c2 = sel.colors[1] ?? c1;
  return checkoutUrl(sel.pack, c1, [c1, c2]);
}

/**
 * Container do Google Tag Manager do site publico (o painel /admin nao carrega).
 * O Pixel da Meta (e o GA4) moram DENTRO do GTM, com o ID na variavel "CONST - Meta Pixel ID".
 * Nao reinstalar o Pixel no codigo: os eventos contariam em dobro.
 */
export const GTM_ID = "GTM-594998R9";

/**
 * Projeto do Microsoft Clarity (mapas de calor e gravacoes). No site publico ele entra pelo GTM (tag 34); no
 * /checkout, que nao carrega GTM, entra direto pelo `loadClarity` (components/checkout/clarity.ts), depois do
 * consentimento. Pedido do dono 2026-09-30.
 */
export const CLARITY_ID = "yqjdjw8upg";

export const BRAND_NAME = "AquaBlast";

// E-mail publico de contato da loja, confirmado pelo dono em 2026-09-26
// (substitui o endereco antigo, que era de outro dominio).
export const CONTACT_EMAIL = "contato.aquablastbr@gmail.com";

// Pagina da politica de trocas e devolucoes (src/app/(site)/trocas-e-devolucoes).
export const RETURNS_PATH = "/trocas-e-devolucoes";

export const COLOR_LABELS: Record<Color, string> = {
  azul: "Azul",
  vermelho: "Vermelho",
  preto: "Preto",
};

export const COLOR_KEYS = Object.keys(COLOR_LABELS) as Color[];

/**
 * Precos decididos pelo dono em 27/09 (wiki: pedidos/2026-09-27-preco-parcela-destaque): a parcela do cartao
 * em destaque e o Pix a vista embaixo, R$ 10 mais barato. O desconto so existe no checkout proprio do dono;
 * nao publicar enquanto o checkout cobrar o mesmo valor no Pix e no cartao.
 * `amount` e o preco no Pix (o menor), usado no JSON-LD.
 * 03/10 (dono: "nosso foco e pagamento no Pix"): o Pix nao mudou; o cartao subiu R$ 10 na unidade e R$ 20 no
 * kit, entao o desconto do Pix passou a R$ 20 / R$ 30. Tem de bater com `checkout.prices` em /admin/produtos.
 */
export const PRICES: Record<
  Pack,
  { installment: string; card: string; pix: string; pixDiscount: string; amount: number }
> = {
  unit: { installment: "R$ 14,99", card: "R$ 179,90", pix: "R$ 159,90", pixDiscount: "R$ 20", amount: 159.9 },
  kit: { installment: "R$ 23,33", card: "R$ 279,90", pix: "R$ 249,90", pixDiscount: "R$ 30", amount: 249.9 },
};

/** Economia do kit contra 2 unidades, no Pix (319,80 - 249,90); no cartao e maior (R$ 79,90). */
export const KIT_SAVING = "R$ 69,90";

export type HeroPhotoKind = "photo" | "art" | "campaign" | "scene";

export interface HeroPhoto {
  src: string;
  title: string;
  alt: string;
  kind: HeroPhotoKind;
}

export const productPhoto = (color: Color): HeroPhoto => ({
  src: `/produto-${color}.webp`,
  title: `AquaBlast ${COLOR_LABELS[color]}`,
  alt: `Foto do AquaBlast ${COLOR_LABELS[color].toLowerCase()}`,
  kind: "photo",
});

export const KIT_PHOTO: HeroPhoto = {
  src: "/campanha-kit-azul-preto.webp",
  title: "Kit AquaBlast azul + preto",
  alt: "Arte do kit com um AquaBlast azul e um preto inteiros",
  kind: "art",
};

export const CAMPAIGN_PHOTO: HeroPhoto = {
  src: "/campanha-abertura.webp",
  title: "1 unidade AquaBlast",
  alt: "Arte promocional do brinquedo lançador de água com luz LED, recarga USB e reservatório em tambor",
  kind: "campaign",
};

export const HERO_PHOTOS: HeroPhoto[] = [CAMPAIGN_PHOTO, KIT_PHOTO, ...COLOR_KEYS.map(productPhoto)];

export const productPhotoIndex = (color: Color): number => COLOR_KEYS.indexOf(color) + 2;

export const MOBILE_QUERY = "(max-width: 56.25rem)";
export const DESKTOP_QUERY = "(min-width: 56.3125rem)";

// Mesmo ícone inline do index.html original (gota azul).
export const SITE_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath fill='%2300aef0' d='M34 3C22 18 12 29 12 42a22 22 0 1 0 44 0C56 29 46 18 34 3Z'/%3E%3C/svg%3E";
