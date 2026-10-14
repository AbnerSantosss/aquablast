import Image from "next/image";
import type { CSSProperties } from "react";
import { Truck } from "lucide-react";
import type { Theme } from "@/lib/checkout/own/theme";
import type { Selection } from "@/lib/checkout/own/catalog";
import { BANNER_RECOMMENDED, bannerProductOf, type BannerArt, type BannerDevice, type BannerMap } from "@/lib/checkout/own/banners";
import type { Color } from "@/lib/site/types";
import { colorName, effectiveSelectionClient, thumbOf } from "./OrderSummary";
import styles from "./Campaign.module.css";

/**
 * Título com as duas últimas palavras em `<em>` (origem: `O presente para <em>brincar junto.</em>`). O título
 * vem do painel como texto puro; esta regra reproduz o destaque da origem para qualquer texto do tema.
 */
function splitTitle(title: string): [string, string] {
  const words = title.trim().split(/\s+/);
  if (words.length < 3) return ["", title];
  return [`${words.slice(0, -2).join(" ")} `, words.slice(-2).join(" ")];
}

/** Normaliza a chamada para o rótulo acessível da campanha. */
function titleCase(text: string): string {
  return text
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((w, i) => (i === 0 || w.length > 3 ? w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1) : w))
    .join(" ");
}

/** Proporção da caixa da arte (largura / altura), a mesma do tamanho recomendado no painel. O CSS lê pela variável. */
const ratioOf = (device: BannerDevice) => `${BANNER_RECOMMENDED[device].width} / ${BANNER_RECOMMENDED[device].height}`;
const ART_BOX = { "--campaign-art-desktop": ratioOf("desktop"), "--campaign-art-mobile": ratioOf("mobile") } as CSSProperties;

/**
 * Arte pronta enviada no painel. Sai sem passar pelo otimizador (`unoptimized`, como no painel): a rota da arte
 * já devolve o arquivo com cache longo. O carregamento fica no padrão do next/image (`loading="lazy"`) DE
 * PROPÓSITO: a arte do outro dispositivo fica dentro de uma caixa com `display: none`, e imagem "lazy" que não
 * é desenhada não é baixada. Com `preload`, `priority` ou `loading="eager"` as duas artes seriam baixadas
 * (guia do next/image, "Theme detection"). `fetchPriority` só adianta o pedido da arte que aparece.
 * `fill`: a imagem ocupa a caixa (.art, posicionada no CSS) e o `object-fit: contain` do CSS a mostra inteira,
 * qualquer que seja a proporção do arquivo enviado. Quem define o tamanho é a caixa, não o arquivo.
 * `key` no id: trocar de produto monta outra imagem em vez de reaproveitar a anterior.
 */
function Art({ art, device }: { art: BannerArt; device: BannerDevice }) {
  return (
    <div className={`${styles.art} ${device === "desktop" ? styles.artDesktop : styles.artMobile} campaign-art campaign-art-${device}`}>
      <Image key={art.id} src={art.url} alt={art.alt} fill fetchPriority="high" unoptimized />
    </div>
  );
}

/**
 * Banner da etapa 1. Para o produto escolhido (`bannerProductOf`: unidade de cada cor ou kit, já contando a
 * segunda unidade aceita) o painel pode ter uma arte pronta de computador e outra de celular:
 * - 1100 px de largura ou mais: arte de computador; sem ela, o banner de texto;
 * - 768 a 1099 px: arte de celular; sem ela, o banner de texto;
 * - abaixo de 768 px: arte de celular; sem ela, nenhum banner.
 * Quem decide a faixa é o CSS (Campaign.module.css), não o JavaScript: o HTML sai igual do servidor e nada pisca
 * na hidratação. Com arte, o banner é só a imagem. O texto só entra no HTML quando alguma faixa ainda precisa dele.
 * Banner de texto: a campanha padrão destaca os produtos da seleção; textos e fundos personalizados vêm do tema.
 */
export function Campaign({ theme, selection, bump = false, bumpColor = null, banners = {} }: { theme: Theme; selection: Selection; bump?: boolean; bumpColor?: Color | null; banners?: BannerMap }) {
  const selected = effectiveSelectionClient(selection, bump, bumpColor);
  const isKit = selected.pack === "kit";
  const defaultBanner = theme.bannerImage === "/checkout/banner-immersive.webp";
  // Atualiza a campanha padrão já salva, sem sobrescrever textos personalizados no painel.
  const defaultCopy = defaultBanner
    && theme.bannerTitle.trim() === "Seu verão mais divertido."
    && theme.bannerSubtitle.trim() === "Diversão para o verão inteiro.";
  const title = defaultCopy
    ? isKit ? "Diversão boa é em dupla." : "A diversão começa aqui."
    : theme.bannerTitle.trim();
  const eyebrow = defaultCopy ? "AQUABLAST" : theme.bannerEyebrow.trim();
  const subtitle = defaultCopy
    ? isKit ? "Dois AquaBlast. Mais momentos juntos." : "Seu próximo momento ao ar livre."
    : theme.bannerSubtitle.trim();
  if (!theme.bannerEnabled) return null;
  const product = bannerProductOf(selected);
  const desktopArt = banners[product]?.desktop;
  const mobileArt = banners[product]?.mobile;
  // Com as duas artes nenhuma faixa mostra o banner de texto; com os textos vazios no tema ele também não existe.
  const withText = !!(title || eyebrow || subtitle) && !(desktopArt && mobileArt);
  if (!desktopArt && !mobileArt && !withText) return null;
  const background = defaultBanner
    ? "/kit-background-v40.webp"
    : theme.bannerImage;
  const [head, tail] = splitTitle(title);
  return (
    <section
      className={`${styles.banner} campaign campaign-selected ${isKit ? "campaign-kit" : "campaign-unit"} ${defaultBanner ? "campaign-default" : "campaign-custom"}`}
      aria-label={withText && eyebrow ? `Campanha ${titleCase(eyebrow)}` : "Campanha"}
      data-banner-product={product}
      data-art-desktop={desktopArt ? "" : undefined}
      data-art-mobile={mobileArt ? "" : undefined}
      data-banner-text={withText ? "" : undefined}
      style={ART_BOX}
    >
      {desktopArt ? <Art art={desktopArt} device="desktop" /> : null}
      {mobileArt ? <Art art={mobileArt} device="mobile" /> : null}
      {/* Imagens do banner de texto também no carregamento padrão ("lazy"): na faixa em que ele fica escondido
          (celular sem arte, ou faixa que mostra a arte) nenhuma delas é baixada. */}
      {withText && !defaultBanner ? <div className="campaign-photo">
        <Image
          src={background}
          alt=""
          fill
          sizes="(max-width: 760px) 100vw, 1152px"
          fetchPriority="high"
        />
      </div> : null}
      {withText ? <div className={`${styles.copy} campaign-copy`}>
        {eyebrow ? <span>{eyebrow}</span> : null}
        {title ? <h2>
          {head}
          <em>{tail}</em>
        </h2> : null}
        {subtitle ? <p>{subtitle}</p> : null}
      </div> : null}
      {withText ? <div className={`${styles.products} campaign-products`}>
        {selected.colors.map((color, index) => <Image key={`${index}-${color}`} src={thumbOf(color, 610)} width={280} height={280} alt={`${isKit ? `${index + 1}º ` : ""}AquaBlast ${colorName(color)}`} sizes={isKit ? "(max-width: 760px) 24vw, 220px" : "(max-width: 760px) 45vw, 280px"} />)}
        <span className="campaign-selection">{isKit ? "Kit com 2" : "1 AquaBlast"} · {selected.colors.map(colorName).join(" + ")}</span>
      </div> : null}
      {withText ? <div className={`${styles.benefit} campaign-benefit`}>
        <Truck size={25} strokeWidth={1.6} aria-hidden="true" />
        <span>FRETE</span>
        <strong>GRÁTIS</strong>
        <small>para todo o Brasil</small>
      </div> : null}
    </section>
  );
}
