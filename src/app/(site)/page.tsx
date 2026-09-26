import type { Metadata } from "next";
import { preload } from "react-dom";
import { Accessories } from "@/components/site/Accessories";
import { DeliveryTicker, SkipLink } from "@/components/site/Announcement";
import { Faq } from "@/components/site/Faq";
import { Footer } from "@/components/site/Footer";
import { Gifting } from "@/components/site/Gifting";
import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { JsonLd } from "@/components/site/JsonLd";
import { MobileBuy } from "@/components/site/MobileBuy";
import { Moments } from "@/components/site/Moments";
import { Offers } from "@/components/site/Offers";
import { Reviews } from "@/components/site/Reviews";
import { ReviewViewer } from "@/components/site/ReviewViewer";
import { ReviewViewerProvider } from "@/components/site/ReviewViewerProvider";
import { SelectionProvider } from "@/components/site/SelectionProvider";
import { SiteBehavior } from "@/components/site/SiteBehavior";
import { BRAND_NAME } from "@/lib/site/constants";
import { OG_IMAGE, OG_TITLE, SEO_DESCRIPTION, SEO_TITLE } from "@/lib/site/seo";
import { getSupportWhatsapp } from "@/lib/site/support-contact";

// ISR: a home continua estática (prerender no build), mas é refeita no máximo a cada
// 5 min para pegar o WhatsApp cadastrado no painel sem novo deploy (o build do CI não
// tem banco, então a versão do build sai sem WhatsApp). Salvar "Loja" no painel chama
// revalidatePath("/") e reflete na próxima visita. Valor literal: o Next exige
// número estaticamente analisável.
export const revalidate = 300;

// Textos e imagem de SEO moram em src/lib/site/seo.ts. Sem `keywords`: o Google ignora a tag.
export const metadata: Metadata = {
  title: { absolute: SEO_TITLE },
  description: SEO_DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: BRAND_NAME,
    title: OG_TITLE,
    description: SEO_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: SEO_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

/** Landing page do AquaBlast — porta 1:1 do index.html original. */
export default async function HomePage() {
  // Fundo do .hero-featured-video: é o LCP (Lighthouse, 2026-09-26). No celular o CSS
  // usa a versão de 760 px (mesmo breakpoint de 42.5rem), então há um preload por faixa.
  preload("/thumbs/video-moldura-760.webp", { as: "image", fetchPriority: "high", media: "(max-width: 42.5rem)" });
  preload("/video-moldura.webp", { as: "image", fetchPriority: "high", media: "(min-width: 42.5625rem)" });
  // Uma leitura do banco por render; null (sem cadastro ou sem banco) = nenhum WhatsApp.
  const whatsapp = await getSupportWhatsapp();
  return (
    <>
      <JsonLd whatsapp={whatsapp} />
      <div className="aquablast-home">
        <SkipLink />
        <DeliveryTicker />
        <Header />
        <SelectionProvider>
          <ReviewViewerProvider>
            <main id="conteudo">
              <Hero />
              <Moments />
              <Gifting />
              <Accessories />
              <Offers />
              <Reviews />
              <Faq />
            </main>
            <Footer whatsapp={whatsapp} />
            <MobileBuy />
            <ReviewViewer />
          </ReviewViewerProvider>
        </SelectionProvider>
        <SiteBehavior />
      </div>
    </>
  );
}
