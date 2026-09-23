import type { Metadata } from "next";
import { Accessories } from "@/components/site/Accessories";
import { Announcement, DeliveryTicker, SkipLink } from "@/components/site/Announcement";
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

const TITLE = "AquaBlast – Presente de Dia das Crianças: pistola de água elétrica";
const DESCRIPTION =
  "Presente de Dia das Crianças que vira uma boa lembrança: AquaBlast, pistola de água elétrica com efeito luminoso, bateria recarregável e reservatório em tambor. Escolha 1 unidade (azul, vermelho ou preto) ou o kit com 2 e presenteie com mais brincadeira, risadas e tempo juntos.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Dia das Crianças",
    "presente de Dia das Crianças",
    "presente para criança",
    "pistola de água elétrica",
    "brinquedo de água",
    "lançador de água recarregável",
    "AquaBlast",
    "kit com 2 AquaBlast",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "AquaBlast",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/aquablast-hero.webp",
        width: 1664,
        height: 936,
        alt: "AquaBlast — pistola de água elétrica com efeito luminoso, presente de Dia das Crianças",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/aquablast-hero.webp"],
  },
};

/** Landing page do AquaBlast — porta 1:1 do index.html original. */
export default function HomePage() {
  return (
    <>
      <JsonLd />
      <SkipLink />
      <Announcement />
      <DeliveryTicker />
      <Header />
      <SelectionProvider>
        <ReviewViewerProvider>
          <main id="conteudo">
            <Hero />
            <Moments />
            <Accessories />
            <Offers />
            <Reviews />
            <Gifting />
            <Faq />
          </main>
          <Footer />
          <MobileBuy />
          <ReviewViewer />
        </ReviewViewerProvider>
      </SelectionProvider>
      <SiteBehavior />
    </>
  );
}
