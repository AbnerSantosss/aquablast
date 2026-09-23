import type { Color, Pack } from "@/lib/site/types";

export const CHECKOUT_URL =
  "https://seguro.elefantol-oficial.store/api/public/shopify?product=1869756463162&store=18697";

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
