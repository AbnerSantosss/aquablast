import Script from "next/script";
import { GTM_ID } from "@/lib/site/constants";

// Codigo oficial do GTM. "afterInteractive" e o que o Next recomenda (mesmo do @next/third-parties):
// entra logo depois da hidratacao sem bloquear o LCP. "beforeInteractive" so funciona no layout
// raiz, e ai o painel /admin tambem carregaria o GTM.
const gtmCode = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`;

/** Script do GTM do site publico. */
export function GoogleTagManager() {
  return (
    <Script id="gtm" strategy="afterInteractive">
      {gtmCode}
    </Script>
  );
}

/** Fallback sem JavaScript: primeiro elemento do <body>, como pede o GTM. */
export function GoogleTagManagerNoScript() {
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
