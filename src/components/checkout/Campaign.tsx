import Image from "next/image";
import type { Theme } from "@/lib/checkout/own/theme";
import type { Selection } from "@/lib/checkout/own/catalog";
import type { Color } from "@/lib/site/types";
import { Gift } from "lucide-react";
import { colorName, effectiveSelectionClient, thumbOf } from "./OrderSummary";

/**
 * Título com as duas últimas palavras em `<em>` (origem: `O presente para <em>brincar junto.</em>`). O título
 * vem do painel como texto puro; esta regra reproduz o destaque da origem para qualquer texto do tema.
 */
function splitTitle(title: string): [string, string] {
  const words = title.trim().split(/\s+/);
  if (words.length < 3) return ["", title];
  return [`${words.slice(0, -2).join(" ")} `, words.slice(-2).join(" ")];
}

/** "DIA DAS CRIANÇAS" -> "Dia das Crianças" (rótulo acessível igual ao da origem: "Campanha Dia das Crianças"). */
function titleCase(text: string): string {
  return text
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((w, i) => (i === 0 || w.length > 3 ? w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1) : w))
    .join(" ");
}

/**
 * A campanha padrão usa o cenário aquático com os produtos da seleção, incluindo a segunda unidade.
 * Textos e fundos personalizados continuam vindo do tema; as imagens do produto acompanham as cores.
 */
export function Campaign({ theme, selection, bump = false, bumpColor = null }: { theme: Theme; selection: Selection; bump?: boolean; bumpColor?: Color | null }) {
  if (!theme.bannerEnabled) return null;
  const selected = effectiveSelectionClient(selection, bump, bumpColor);
  const isKit = selected.pack === "kit";
  const lifestyle = theme.bannerImage === "/checkout/banner-immersive.webp";
  const background = lifestyle ? `/checkout/campaign-child-${selected.colors[0]}-v2.webp` : theme.bannerImage;
  const [head, tail] = splitTitle(theme.bannerTitle);
  return (
    <section className={`campaign campaign-selected ${isKit ? "campaign-kit" : "campaign-unit"}${lifestyle ? " campaign-lifestyle" : ""}`} aria-label={theme.bannerEyebrow ? `Campanha ${titleCase(theme.bannerEyebrow)}` : "Campanha"}>
      <div className="campaign-photo">
        <Image
          src={background}
          alt={lifestyle ? `Cena ilustrativa de uma criança se divertindo no jardim com o AquaBlast ${colorName(selected.colors[0])}` : ""}
          fill
          sizes="(max-width: 760px) 100vw, 1180px"
          priority
        />
      </div>
      <div className="campaign-copy">
        {theme.bannerEyebrow ? <span>{theme.bannerEyebrow}</span> : null}
        <h1>
          {head}
          <em>{tail}</em>
        </h1>
        {theme.bannerSubtitle ? <p>{theme.bannerSubtitle}</p> : null}
        <div className="campaign-gift"><Gift size={16} aria-hidden="true" />{isKit ? "Diversão para compartilhar" : "Um presente, muitas aventuras"}</div>
      </div>
      <div className="campaign-products">
        {selected.colors.map((color, index) => <Image key={`${index}-${color}`} src={thumbOf(color, 610)} width={280} height={280} alt={`AquaBlast ${colorName(color)}`} priority sizes="(max-width: 600px) 44vw, 280px" />)}
        <span className="campaign-selection">{isKit ? "Kit com 2" : "1 AquaBlast"} · {selected.colors.map(colorName).join(" + ")}</span>
      </div>
    </section>
  );
}
