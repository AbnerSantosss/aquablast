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
import { deliveryPromiseText } from "@/lib/site/delivery-promise";
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
  // LCP da dobra. Desktop (>= 56.3125rem): o fundo (moldura) do .hero-featured-video, como antes. Celular e tablet
  // (ate 56.25rem, mesmo MOBILE_QUERY do CSS): desde 03/10 22h41 o video aparece sem moldura (mobile-dobra.css), entao
  // a imagem da dobra passa a ser o poster do video; o preload da moldura de 760px saiu para nao baixar arte que
  // nao e usada no celular.
  preload("/videos/video-destaque-v2-poster.jpg", { as: "image", fetchPriority: "high", media: "(max-width: 56.25rem)" });
  preload("/video-moldura.webp", { as: "image", fetchPriority: "high", media: "(min-width: 56.3125rem)" });
  // Uma leitura do banco por render; null (sem cadastro ou sem banco) = nenhum WhatsApp.
  const whatsapp = await getSupportWhatsapp();
  // Aviso de entrega com data limite: decidido aqui, no servidor, e repassado por prop (sem erro de hidratação e
  // sem a página pular). Passada a data, a próxima regeração da home (revalidate) já sai sem o aviso.
  const promise = deliveryPromiseText();
  return (
    <>
      <JsonLd whatsapp={whatsapp} />
      <div className="aquablast-home">
        <SkipLink />
        <DeliveryTicker promise={promise} />
        <Header />
        <SelectionProvider>
          <ReviewViewerProvider>
            <main id="conteudo">
              <Hero deliveryPromise={promise} />
              {/* Dono, 03/10: avaliacoes logo depois do topo, para testar a conversao. */}
              <Reviews />
              <Moments />
              <Gifting />
              <Accessories />
              <Offers deliveryPromise={promise} />
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
