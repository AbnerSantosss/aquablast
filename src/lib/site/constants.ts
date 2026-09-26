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

/** Pixel "Pixel Plano B" (conta PLANO-0B-PIX). O mesmo ID esta cadastrado na Zedy para o Purchase. */
export const META_PIXEL_ID = "1119943063690657";

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

export const PRICES: Record<Pack, { pix: string; installments: string; amount: number }> = {
  unit: { pix: "R$ 159,90", installments: "ou em até 12x sem juros no cartão", amount: 159.9 },
  kit: { pix: "R$ 239,90", installments: "ou em até 12x sem juros no cartão", amount: 239.9 },
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
  src: "/campanha-kit-azul-preto.webp",
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
