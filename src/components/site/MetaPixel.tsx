"use client";

import Script from "next/script";
import { useEffect } from "react";
import { META_PIXEL_ID, PRICES } from "@/lib/site/constants";
import type { Pack } from "@/lib/site/types";

type Fbq = (command: string, event: string, params?: Record<string, unknown>) => void;

const CONTENT: Record<Pack, { id: string; name: string; items: number }> = {
  unit: { id: "aquablast-1un", name: "1 unidade AquaBlast", items: 1 },
  kit: { id: "aquablast-kit2", name: "Kit com 2 AquaBlast", items: 2 },
};

const viewContent = JSON.stringify({
  content_name: CONTENT.unit.name,
  content_type: "product",
  content_ids: [CONTENT.unit.id],
  value: PRICES.unit.amount,
  currency: "BRL",
});

// Codigo base oficial da Meta. PageView em toda pagina do site publico; ViewContent so na home.
// O Purchase NAO sai daqui: quem dispara e a Zedy, em "Pedidos Pagos" (Apps > Meta Pixel).
const baseCode = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${META_PIXEL_ID}');
fbq('track','PageView');
if(location.pathname==='/'){fbq('track','ViewContent',${viewContent});}`;

function track(event: string, params: Record<string, unknown>) {
  const fbq = (window as Window & { fbq?: Fbq }).fbq;
  if (typeof fbq === "function") fbq("track", event, params);
}

/** Pixel Meta do site publico. InitiateCheckout em todo link de compra marcado com data-purchase. */
export function MetaPixel() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[data-purchase]");
      if (!link) return;
      const pack: Pack = link.dataset.purchase === "kit" ? "kit" : "unit";
      track("InitiateCheckout", {
        content_name: CONTENT[pack].name,
        content_type: "product",
        content_ids: [CONTENT[pack].id],
        num_items: CONTENT[pack].items,
        value: PRICES[pack].amount,
        currency: "BRL",
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {baseCode}
    </Script>
  );
}
