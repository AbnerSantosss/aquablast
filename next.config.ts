import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

/**
 * Checkout próprio (plano Fase 6.4): sem cache e Referrer-Policy explícita no /checkout e nas APIs dele.
 * CSP só nas páginas /checkout: o rastreamento é 100% no servidor (Meta CAPI + GA4 MP), então não há GTM
 * nem pixel aqui. Libera apenas o SDK do Mercado Pago (tokenização do cartão no navegador) e os domínios
 * que ele usa para iframes/API/estáticos. Domínios do MP a confirmar no painel/documentação ao ligar o gateway.
 * 'unsafe-inline' em script-src é exigido pelos scripts inline de hidratação do Next (sem nonce);
 * 'unsafe-eval' e ws: só em desenvolvimento (HMR).
 */
const isDev = process.env.NODE_ENV !== "production";
// Microsoft Clarity no checkout (pedido do dono 2026-09-30): script em www/scripts.clarity.ms, coleta em *.clarity.ms e c.bing.com.
const CLARITY_HOSTS = "https://*.clarity.ms https://c.bing.com";
const MP_HOSTS = "https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mlstatic.com";
const checkoutCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://sdk.mercadopago.com ${MP_HOSTS} ${CLARITY_HOSTS}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // ViaCEP: busca do endereço pelo CEP no navegador (StepEntrega.tsx). Sem ele a CSP bloqueava a busca e
  // todo CEP caía em "não encontrado" (achado na fase 14, 2026-09-27).
  `connect-src 'self' https://viacep.com.br ${MP_HOSTS} ${CLARITY_HOSTS}${isDev ? " ws: wss:" : ""}`,
  `frame-src 'self' ${MP_HOSTS}`,
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
].join("; ");

const checkoutHeaders = [
  { key: "Cache-Control", value: "private, no-store" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // `NEXT_DIST_DIR=.next-build npm run build` permite rodar o build de verificação sem derrubar o
  // `next dev` que usa `.next` (os dois no mesmo diretório se corrompem). Sem a variável, nada muda.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false,
  serverExternalPackages: ["pg", "nodemailer"],
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/api/(.*)", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      // Mídia da LP (PageSpeed 2026-10-02: TTL de 4 h pedia ~20 MB de re-download). 7 dias, sem `immutable`: os nomes não têm hash
      // e o dono vai regravar vídeos, então um prazo longo demais prenderia a versão velha no navegador.
      { source: "/videos/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
      { source: "/thumbs/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
      { source: "/admin/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "private, no-store" }] },
      { source: "/rastrear", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      // App do painel (PWA): o SW precisa ser buscado sempre fresco (senão uma versão velha fica presa até 24 h);
      // o manifest fica fora de /admin/ de propósito, porque o navegador o busca SEM cookie e o proxy redirecionaria.
      {
        source: "/admin-sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      { source: "/admin-app/manifest.webmanifest", headers: [{ key: "Content-Type", value: "application/manifest+json" }, { key: "Cache-Control", value: "no-cache" }] },
      // App Android (TWA do PWABuilder): o Android confere este arquivo para abrir o painel em tela cheia, sem barra de endereço.
      // O SHA-256 é o da chave `signing.keystore` guardada fora do repo; trocar a chave = trocar este arquivo.
      { source: "/.well-known/assetlinks.json", headers: [{ key: "Content-Type", value: "application/json" }, { key: "Cache-Control", value: "no-cache" }] },
      // `:path*` também casa com "/checkout" sem nada depois.
      { source: "/checkout/:path*", headers: [...checkoutHeaders, { key: "Content-Security-Policy", value: checkoutCsp }] },
      { source: "/api/checkout/:path*", headers: checkoutHeaders },
      { source: "/checkout/pedido/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
