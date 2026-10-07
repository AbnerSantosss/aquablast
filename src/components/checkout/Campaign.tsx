import Image from "next/image";
import { Truck } from "lucide-react";
import type { Theme } from "@/lib/checkout/own/theme";
import type { Selection } from "@/lib/checkout/own/catalog";
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

/**
 * A campanha padrão destaca os produtos da seleção, incluindo a segunda unidade.
 * Textos e fundos personalizados continuam vindo do tema; as imagens do produto acompanham as cores.
 */
export function Campaign({ theme, selection, bump = false, bumpColor = null }: { theme: Theme; selection: Selection; bump?: boolean; bumpColor?: Color | null }) {
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
  if (!theme.bannerEnabled || !(title || eyebrow || subtitle)) return null;
  const background = defaultBanner
    ? "/kit-background-v40.webp"
    : theme.bannerImage;
  const [head, tail] = splitTitle(title);
  return (
    <section className={`${styles.banner} campaign campaign-selected ${isKit ? "campaign-kit" : "campaign-unit"} ${defaultBanner ? "campaign-default" : "campaign-custom"}`} aria-label={eyebrow ? `Campanha ${titleCase(eyebrow)}` : "Campanha"}>
      {!defaultBanner ? <div className="campaign-photo">
        <Image
          src={background}
          alt=""
          fill
          sizes="(max-width: 760px) 100vw, 1152px"
          loading="eager"
          fetchPriority="high"
        />
      </div> : null}
      <div className={`${styles.copy} campaign-copy`}>
        {eyebrow ? <span>{eyebrow}</span> : null}
        {title ? <h2>
          {head}
          <em>{tail}</em>
        </h2> : null}
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className={`${styles.products} campaign-products`}>
        {selected.colors.map((color, index) => <Image key={`${index}-${color}`} src={thumbOf(color, 610)} width={280} height={280} alt={`${isKit ? `${index + 1}º ` : ""}AquaBlast ${colorName(color)}`} loading="eager" sizes={isKit ? "(max-width: 760px) 24vw, 220px" : "(max-width: 760px) 45vw, 280px"} />)}
        <span className="campaign-selection">{isKit ? "Kit com 2" : "1 AquaBlast"} · {selected.colors.map(colorName).join(" + ")}</span>
      </div>
      <div className={styles.benefit}>
        <Truck size={25} strokeWidth={1.6} aria-hidden="true" />
        <span>FRETE</span>
        <strong>GRÁTIS</strong>
        <small>para todo o Brasil</small>
      </div>
    </section>
  );
}
