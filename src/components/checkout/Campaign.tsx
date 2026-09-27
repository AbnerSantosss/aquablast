import Image from "next/image";
import type { Theme } from "@/lib/checkout/own/theme";

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
 * Banner da campanha (origem app/checkout.tsx, `.campaign`). Textos e imagem vêm do tema (painel
 * /admin/checkout); `bannerImage` já passou por `safeImageUrl` no servidor (theme.ts), então é seguro
 * usar em `next/image`. `fill` porque `.campaign-photo` já é um contêiner de tamanho definido em CSS.
 */
export function Campaign({ theme }: { theme: Theme }) {
  if (!theme.bannerEnabled) return null;
  const [head, tail] = splitTitle(theme.bannerTitle);
  return (
    <section className="campaign" aria-label={theme.bannerEyebrow ? `Campanha ${titleCase(theme.bannerEyebrow)}` : "Campanha"}>
      <div className="campaign-photo">
        <Image
          src={theme.bannerImage}
          alt="AquaBlast azul e preta em um cenário de água azul que preenche todo o banner"
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
      </div>
    </section>
  );
}
