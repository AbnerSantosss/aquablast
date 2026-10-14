import type { Color, Pack } from "@/lib/site/types";
import { BRAND_NAME, COLOR_KEYS, COLOR_LABELS } from "@/lib/site/constants";

/**
 * Banner do checkout por produto e por dispositivo (pedido do dono em 2026-10-11): o dono envia uma arte
 * pronta pelo painel (/admin/checkout) para cada produto, em versão de computador e de celular.
 * Este arquivo é PURO (sem banco): pode ser importado em componente "use client". A leitura do banco fica
 * em banners-server.ts e a conferência do arquivo em banners-image.ts.
 */
export const BANNER_DEVICES = ["desktop", "mobile"] as const;
export type BannerDevice = (typeof BANNER_DEVICES)[number];

/** "unit-<cor>" para a unidade de cada cor; "kit" é um só, qualquer que seja a dupla de cores. */
export type BannerProduct = `unit-${Color}` | "kit";
export const BANNER_PRODUCTS: BannerProduct[] = [...COLOR_KEYS.map((color): BannerProduct => `unit-${color}`), "kit"];

/** O que o checkout precisa para mostrar a arte. `alt` já vem preenchido (o do painel ou o padrão). */
export type BannerArt = { id: string; url: string; width: number; height: number; alt: string };
export type BannerMap = Partial<Record<BannerProduct, Partial<Record<BannerDevice, BannerArt>>>>;

/** O que o painel mostra em cada espaço: a arte, a descrição como o dono digitou, o tipo e o peso do arquivo. */
export interface AdminBannerArt extends BannerArt {
  /** Descrição gravada pelo dono. Vazia = o checkout usa o texto padrão (que já vem em `alt`). */
  customAlt: string;
  mime: string;
  sizeBytes: number;
}
export type AdminBannerMap = Partial<Record<BannerProduct, Partial<Record<BannerDevice, AdminBannerArt>>>>;

export const isBannerProduct = (value: unknown): value is BannerProduct => typeof value === "string" && (BANNER_PRODUCTS as string[]).includes(value);
export const isBannerDevice = (value: unknown): value is BannerDevice => typeof value === "string" && (BANNER_DEVICES as readonly string[]).includes(value);

/** Produto do banner para a escolha do cliente: o kit vale "kit"; a unidade vale a cor escolhida. */
export function bannerProductOf(selection: { pack: Pack; colors: Color[] }): BannerProduct {
  if (selection.pack === "kit") return "kit";
  const color = selection.colors[0];
  return COLOR_KEYS.includes(color) ? `unit-${color}` : `unit-${COLOR_KEYS[0]}`;
}

export function bannerImageUrl(id: string): string {
  return `/api/checkout/banner-image/${id}`;
}

/**
 * Tamanho de arte recomendado ao dono no painel, por dispositivo. É também a PROPORÇÃO da caixa em que o
 * checkout mostra a arte (Campaign.tsx passa largura / altura ao CSS), então os dois andam juntos.
 * - desktop: 2400 x 120 = o dobro da caixa do banner no computador, 1200 x 60 px (--sh-banner em
 *   styles/checkout/desktop-shell.css). Proporção 20:1.
 * - mobile: 1170 x 195 = três vezes a caixa num celular de 390 px de largura (390 x 65 px). Proporção 6:1.
 *   A mesma arte serve ao tablet (768 a 1099 px), onde a caixa mede 680 x 113 px.
 * Mudou a altura da caixa no computador ou a proporção no celular: mude aqui e refaça a conta de peso no
 * comentário de banners-image.ts.
 */
export const BANNER_RECOMMENDED: Record<BannerDevice, { width: number; height: number }> = {
  desktop: { width: 2400, height: 120 },
  mobile: { width: 1170, height: 195 },
};

/** Tamanho máximo da "Descrição da imagem" (texto alternativo) que o painel aceita. */
export const BANNER_ALT_MAX = 120;

/** A arte "mobile" vale do celular ao tablet (até 1099 px de largura); a "desktop", de 1100 px para cima. */
export const BANNER_DEVICE_LABELS: Record<BannerDevice, string> = { desktop: "Computador", mobile: "Celular e tablet" };

const UNIT_LABELS: Record<Color, string> = { azul: "Unidade azul", vermelho: "Unidade vermelha", preto: "Unidade preta" };

const colorOf = (product: BannerProduct): Color | null => (product === "kit" ? null : (product.slice("unit-".length) as Color));

/** Nome do produto como o dono lê no painel: "Unidade azul", "Unidade vermelha", "Unidade preta", "Kit com 2". */
export function bannerProductLabel(product: BannerProduct): string {
  const color = colorOf(product);
  return color ? UNIT_LABELS[color] : "Kit com 2";
}

/** Texto alternativo usado quando o dono deixa a descrição vazia: "Banner AquaBlast Azul" / "Banner Kit AquaBlast". */
export function bannerDefaultAlt(product: BannerProduct): string {
  const color = colorOf(product);
  return color ? `Banner ${BRAND_NAME} ${COLOR_LABELS[color]}` : `Banner Kit ${BRAND_NAME}`;
}

/** Quanto a proporção pode fugir da recomendada (para mais ou para menos) antes de o painel avisar. */
export const BANNER_RATIO_TOLERANCE = 0.15;

/** A proporção (largura / altura) da arte foge muito da recomendada para o dispositivo? Só gera aviso; não bloqueia. */
export function bannerRatioIsOff(device: BannerDevice, width: number, height: number): boolean {
  if (width < 1 || height < 1) return false;
  const recommended = BANNER_RECOMMENDED[device];
  const expected = recommended.width / recommended.height;
  return Math.abs(width / height / expected - 1) > BANNER_RATIO_TOLERANCE;
}
