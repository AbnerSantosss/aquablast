import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MetaPixel } from "@/components/site/MetaPixel";
import { SITE_ICON } from "@/lib/site/constants";
// Mesma ordem do <head> do index.html original.
import "@/styles/site/style.css";
import "@/styles/site/offer-cards.css";
import "@/styles/site/desktop-product.css";
import "@/styles/site/mobile-offers.css";
import "@/styles/site/reviews.css";
import "@/styles/site/purchase-details.css";
import "@/styles/site/viewport-tracking.css";
import "@/styles/site/visual-refresh.css";
import "@/styles/site/desktop-focus.css";

export const metadata: Metadata = {
  title: "AquaBlast — O presente que vira uma boa lembrança",
  description:
    "Presenteie com mais brincadeira, risadas e tempo juntos. Conheça o AquaBlast e escolha uma unidade ou o kit para compartilhar a diversão.",
  applicationName: "AquaBlast",
  icons: { icon: [{ url: SITE_ICON, type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#063760",
};

/**
 * Layout do site público: só CSS e metadados. O cromo da landing (anúncio, faixa,
 * header, footer, barra mobile) fica em page.tsx porque /rastrear (mesmo grupo)
 * renderiza o próprio header/footer, como no site original.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preload" href="/video-moldura.webp" as="image" />
      <link rel="preload" href="/fonts/nunito-900.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      {children}
      <MetaPixel />
    </>
  );
}
