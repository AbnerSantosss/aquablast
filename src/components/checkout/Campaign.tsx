import Image from "next/image";
import type { Theme } from "@/lib/checkout/own/theme";

/**
 * Banner da campanha (origem app/checkout.tsx, `.campaign`). Textos e imagem vêm do tema (painel
 * /admin/checkout); `bannerImage` já passou por `safeImageUrl` no servidor (theme.ts), então é seguro
 * usar em `next/image`. `fill` porque `.campaign-photo` já é um contêiner de tamanho definido em CSS
 * (position:absolute, height:100%, aspect-ratio:3/1) — exatamente o que `fill` espera.
 */
export function Campaign({ theme }: { theme: Theme }) {
  if (!theme.bannerEnabled) return null;
  return (
    <section className="campaign">
      <div className="campaign-photo">
        <Image src={theme.bannerImage} alt="" fill sizes="(max-width: 760px) 100vw, 640px" priority />
      </div>
      <div className="campaign-copy">
        {theme.bannerEyebrow ? <span>{theme.bannerEyebrow}</span> : null}
        <h1>{theme.bannerTitle}</h1>
        {theme.bannerSubtitle ? <p>{theme.bannerSubtitle}</p> : null}
      </div>
    </section>
  );
}
