import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import { GoogleTagManager, GoogleTagManagerNoScript } from "@/components/site/GoogleTagManager";
import { MetaPixel } from "@/components/site/MetaPixel";
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
import "@/styles/site/selection-gifting.css";

export const metadata: Metadata = {
  title: "AquaBlast — O presente que vira uma boa lembrança",
  description:
    "Presenteie com mais brincadeira, risadas e tempo juntos. Conheça o AquaBlast e escolha uma unidade ou o kit para compartilhar a diversão.",
  applicationName: "AquaBlast",
  // Arquivos reais em public/ (a mesma gota de SITE_ICON): o Google Search não usa favicon em data: URI.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
  // preload() do React em vez de <link> no JSX: o <link> saía duplicado no HTML.
  // O preload do LCP (fundo do vídeo) fica só na home, em page.tsx.
  preload("/fonts/nunito-900.ttf", { as: "font", type: "font/ttf", crossOrigin: "anonymous" });
  return (
    <>
      <GoogleTagManagerNoScript />
      <GoogleTagManager />
      {children}
      <MetaPixel />
    </>
  );
}
