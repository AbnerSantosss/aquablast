import type { Metadata } from "next";
import { Suspense } from "react";
import { Accessories } from "@/components/site/Accessories";
import { Comparison } from "@/components/site/Comparison";
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
import { PricesProvider } from "@/components/site/PricesProvider";
import { Reviews } from "@/components/site/Reviews";
import { ReviewViewer } from "@/components/site/ReviewViewer";
import { ReviewViewerProvider } from "@/components/site/ReviewViewerProvider";
import { SelectionProvider } from "@/components/site/SelectionProvider";
import { SiteBehavior } from "@/components/site/SiteBehavior";
import { BRAND_NAME } from "@/lib/site/constants";
import { PurchaseBenefits, SummerClosing } from "@/components/site/SummerClosing";
import { getSitePrices } from "@/lib/site/prices-server";
import { OG_IMAGE, OG_TITLE, SEO_TITLE, seoDescription } from "@/lib/site/seo";
import { getSupportWhatsapp } from "@/lib/site/support-contact";

// ISR: a home continua estática (prerender no build), mas é refeita no máximo a cada
// 5 min para pegar o WhatsApp e os preços cadastrados no painel sem novo deploy (o build
// do CI não tem banco, então a versão do build sai sem WhatsApp e com os preços de reserva).
// Salvar "Loja" ou "Produtos" no painel chama revalidatePath("/") e reflete na próxima
// visita. Valor literal: o Next exige número estaticamente analisável.
export const revalidate = 300;

// Textos e imagem de SEO moram em src/lib/site/seo.ts. Sem `keywords`: o Google ignora a tag.
// Função (e não constante) porque a descrição cita o preço, que vem do painel.
export async function generateMetadata(): Promise<Metadata> {
  const description = seoDescription(await getSitePrices());
  return {
    title: { absolute: SEO_TITLE },
    description,
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url: "/",
      siteName: BRAND_NAME,
      title: OG_TITLE,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: OG_TITLE,
      description,
      images: [OG_IMAGE],
    },
  };
}

// Somente os trechos que usam o contato aguardam o banco. O cache por render de
// getSupportWhatsapp compartilha a leitura entre ambos, sem atrasar a galeria.
async function HomeJsonLd() {
  const [whatsapp, prices] = await Promise.all([getSupportWhatsapp(), getSitePrices()]);
  return <JsonLd whatsapp={whatsapp} prices={prices} />;
}

async function HomeFooter() {
  const whatsapp = await getSupportWhatsapp();
  return <Footer whatsapp={whatsapp} />;
}

/** Landing page do AquaBlast — porta 1:1 do index.html original. */
export default async function HomePage() {
  const prices = await getSitePrices();
  return (
    <>
      <Suspense fallback={null}>
        <HomeJsonLd />
      </Suspense>
      <div className="aquablast-home">
        <SkipLink />
        <DeliveryTicker />
        <Header />
        <PricesProvider value={prices}>
          <SelectionProvider>
            <ReviewViewerProvider>
              <main id="conteudo">
                <Hero />
                <Reviews />
                <Offers />
                <Accessories />
                <Comparison />
                <Moments />
                <Gifting />
                <PurchaseBenefits />
                <Faq prices={prices} />
                <SummerClosing />
              </main>
              <Suspense fallback={<Footer />}>
                <HomeFooter />
              </Suspense>
              <MobileBuy />
              <ReviewViewer />
            </ReviewViewerProvider>
          </SelectionProvider>
        </PricesProvider>
        <SiteBehavior />
      </div>
    </>
  );
}
