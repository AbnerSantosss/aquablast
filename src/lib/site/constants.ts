import type { Color, Pack } from "@/lib/site/types";

// Checkout Zedy da loja AquaBlast (38320), no domínio próprio seguro.aquablastbrasil.com.br.
// Cada cor (e cada combinação do kit) é uma variação com ID próprio na Zedy
// (Produtos → "Link de compra"). Trocou/recriou produto na Zedy? Atualize os IDs abaixo.
const CHECKOUT_BASE = "https://seguro.aquablastbrasil.com.br/api/public/shopify";
const CHECKOUT_STORE = "38320";

const UNIT_PRODUCT_IDS: Record<Color, string> = {
  azul: "3832091532428",
  vermelho: "3832089171556",
  preto: "3832073618985",
};

// [cor do 1º][cor do 2º]
const KIT_PRODUCT_IDS: Record<Color, Record<Color, string>> = {
  azul: { azul: "3832082498171", vermelho: "3832061937543", preto: "3832042128844" },
  vermelho: { azul: "3832056938296", vermelho: "3832034987449", preto: "3832058556951" },
  preto: { azul: "3832083966525", vermelho: "3832088592283", preto: "3832017287217" },
};

export function checkoutUrl(pack: Pack, color: Color, kitColors: readonly [Color, Color]): string {
  const product = pack === "kit" ? KIT_PRODUCT_IDS[kitColors[0]][kitColors[1]] : UNIT_PRODUCT_IDS[color];
  return `${CHECKOUT_BASE}?product=${product}&store=${CHECKOUT_STORE}`;
}

// Links padrão (seleção inicial do site: 1 unidade azul; kit azul + preto), usados no JSON-LD.
export const CHECKOUT_URL = checkoutUrl("unit", "azul", ["azul", "preto"]);
export const KIT_CHECKOUT_URL = checkoutUrl("kit", "azul", ["azul", "preto"]);

export const BRAND_NAME = "AquaBlast";

export const COLOR_LABELS: Record<Color, string> = {
  azul: "Azul",
  vermelho: "Vermelho",
  preto: "Preto",
};

export const COLOR_KEYS = Object.keys(COLOR_LABELS) as Color[];

export const PRICES: Record<Pack, { pix: string; installments: string; amount: number }> = {
  unit: { pix: "R$ 159,90", installments: "ou 12x de R$ 14,16 no cartão", amount: 159.9 },
  kit: { pix: "R$ 239,90", installments: "ou 12x de R$ 22,49 no cartão", amount: 239.9 },
};

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
  src: "/kit-azul-preto-v40.webp",
  title: "Kit AquaBlast azul + preto",
  alt: "Arte do kit com um AquaBlast azul e um preto inteiros",
  kind: "art",
};

export const CAMPAIGN_PHOTO: HeroPhoto = {
  src: "/campanha-abertura.webp",
  title: "1 unidade AquaBlast",
  alt: "Arte promocional da pistola de água elétrica com luz LED, recarga USB e reservatório em tambor",
  kind: "campaign",
};

export const HERO_PHOTOS: HeroPhoto[] = [CAMPAIGN_PHOTO, KIT_PHOTO, ...COLOR_KEYS.map(productPhoto)];

export const productPhotoIndex = (color: Color): number => COLOR_KEYS.indexOf(color) + 2;

export const MOBILE_QUERY = "(max-width: 56.25rem)";
export const DESKTOP_QUERY = "(min-width: 56.3125rem)";

// Mesmo ícone inline do index.html original (gota azul).
export const SITE_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath fill='%2300aef0' d='M34 3C22 18 12 29 12 42a22 22 0 1 0 44 0C56 29 46 18 34 3Z'/%3E%3C/svg%3E";
