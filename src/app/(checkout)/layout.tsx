import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import type { ReactNode } from "react";
import { InternoBadge } from "@/components/site/InternoBadge";
import "@/styles/checkout/checkout.css";
import "@/styles/checkout/refinements.css";
import "@/styles/checkout/summer-checkout.css";
import "@/styles/checkout/mobile-ux.css";
import "@/styles/checkout/forms-ux.css";
import "@/styles/checkout/payment-ux.css";
import "@/styles/checkout/reference-checkout.css";

/**
 * Layout do grupo de rotas (checkout) — fase 8.4 do plano. Vale para /checkout, /checkout/pedido/[token]
 * e /checkout/descadastrar/[token] (fase 10, agente emails-abandono).
 *
 * Portado de ORIGEM/app/layout.tsx (fontes Bricolage Grotesque + Figtree, mesmo padrão de metadata),
 * com uma diferença deliberada: **sem GoogleTagManager/dataLayer aqui**. A revisão do dono em
 * 2026-09-27 03h16 ("o rastreamento vai ser todo dentro do site via api de conversão") tornou o item
 * 8.4 do plano que previa carregar o GTM do checkout sem efeito — todo o rastreamento do checkout sai
 * do servidor (Meta CAPI + GA4 Measurement Protocol, agente rastreamento), nunca do navegador.
 */
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const text = Figtree({ subsets: ["latin"], variable: "--font-text", display: "swap" });

export const metadata: Metadata = {
  title: "AquaBlast | Finalize seu pedido",
  description: "Seu próximo momento de diversão começa aqui. Checkout AquaBlast.",
  robots: { index: false, follow: false },
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

export default function CheckoutGroupLayout({ children }: { children: ReactNode }) {
  // Só as variáveis de fonte aqui (precisam de um ancestral comum às páginas do grupo:
  // /checkout, /checkout/pedido/[token] e /checkout/descadastrar/[token]). O reset e os tokens de cor
  // do ".ck-root" ficam por conta de cada página, junto com a classe ".ck" quando for o caso — ver
  // comentário no topo de checkout.css.
  return (
    <div className={`${display.variable} ${text.variable}`}>
      <InternoBadge />
      {children}
    </div>
  );
}
