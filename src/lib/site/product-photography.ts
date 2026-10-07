import { COLOR_LABELS } from "./constants";
import galleryImages from "./gallery-images.json";
import type { Color } from "./types";

const directory = "/media/premium-v2";

const galleryWidths = [480, 640, 960, 1280] as const;

// Descritores com a largura real de cada variante pronta, sem compressão na chegada.
export function galleryImageSrcSet(src: string) {
  return galleryWidths.map((width) => `${src.replace(/-\d+\.webp$/, `-${width}.webp`)} ${width}w`).join(", ");
}

export function productPhotography(colors: readonly Color[], format: "gallery" | "offer" = "gallery") {
  const pair = colors.length === 2;
  // A ordem da escolha não muda a composição do mesmo par de cores.
  const filename = pair ? `kit-${[...colors].sort().join("-")}` : `unit-${colors[0]}`;
  const colorNames = colors.map((color) => COLOR_LABELS[color]).join(" e ");

  return {
    src: `${directory}/${filename}${format === "offer" ? "-square" : ""}.webp`,
    alt: pair
      ? `Composição ilustrativa de duas AquaBlast nas cores ${colorNames}, com tambores, ${format === "offer" ? "bateria e cabo USB" : "baterias e cabos USB"}`
      : `Composição ilustrativa de uma AquaBlast ${colorNames}, com tambor, bateria e cabo USB`,
  };
}

export function includedPhotography(color: Color) {
  return {
    ...galleryImages[`included-${color}`],
    alt: `Itens de cada AquaBlast ${COLOR_LABELS[color]}: lançador, tambor de água e visor separados, bateria recarregável e cabo USB`,
  };
}

export const overviewPhotography = {
  ...galleryImages.overview,
  label: "AquaBlast",
  caption: "Visor incluso, luz LED e tambor de água",
  alt: "AquaBlast azul completo: lançador de água elétrico, com detalhes do visor incluso, luz LED frontal e tambor de água",
};

const kitPhotographs = {
  "azul-azul": galleryImages["kit-azul-azul"],
  "azul-preto": galleryImages["kit-azul-preto"],
  "azul-vermelho": galleryImages["kit-azul-vermelho"],
  "preto-preto": galleryImages["kit-preto-preto"],
  "preto-vermelho": galleryImages["kit-preto-vermelho"],
  "vermelho-vermelho": galleryImages["kit-vermelho-vermelho"],
};

export function kitGalleryPhotography(colors: readonly [Color, Color]) {
  const key = [...colors].sort().join("-") as keyof typeof kitPhotographs;
  return {
    ...kitPhotographs[key],
    label: "Kit com 2",
    caption: colors.map((color) => COLOR_LABELS[color]).join(" + "),
    alt: `Kit com duas AquaBlast nas cores ${colors.map((color) => COLOR_LABELS[color]).join(" e ")}, cada uma com visor e tambor de água`,
  };
}

export const productGalleryScenes = [
  {
    ...galleryImages.detail,
    label: "Detalhes",
    caption: "Gatilho, encaixes e textura da empunhadura",
    alt: "Foto de perto do corpo azul, gatilho e textura da empunhadura do AquaBlast",
  },
  {
    ...galleryImages.led,
    label: "Luz LED",
    caption: "Luz LED amarela",
    alt: "Imagem ilustrativa do detalhe da luz LED amarela na ponta do AquaBlast",
  },
  {
    ...galleryImages.family,
    label: "Em família",
    caption: "Em família",
    alt: "Cena ilustrativa de uma família brincando com o AquaBlast ao ar livre",
  },
] as const;
