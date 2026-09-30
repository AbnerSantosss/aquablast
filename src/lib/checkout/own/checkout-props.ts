import { gatewayFor } from "@/lib/gateways";
import { getSettings } from "@/lib/settings";
import { CONTACT_EMAIL } from "@/lib/site/constants";
import { getSupportWhatsapp } from "@/lib/site/support-contact";
import type { CheckoutPack } from "./catalog";
import { normalizeCoupon, quoteBoth, type Quote } from "./pricing";
import { getTheme } from "./theme-server";
import type { Theme } from "./theme";

/**
 * Props do `<Checkout />` montadas no servidor (plano 8.8). Usado por `/checkout` (carrinho novo) e por
 * `/checkout/pedido/[token]` quando o token é de um carrinho ainda aberto (link de recuperação).
 * Espelha `GET /api/checkout/config` sem o round-trip HTTP: já estamos num Server Component.
 * `mode` volta junto para quem chama decidir o redirecionamento para a Zedy (plano 8.9).
 */
export interface CheckoutServerProps {
  theme: Theme;
  methods: ("pix" | "card")[];
  maxInstallments: number;
  /** Validade do código Pix em segundos (`checkout.pixTtlSeconds`): o texto "vale por 10 minutos" sai daqui (fase 14.3). */
  pixTtlSeconds: number;
  bumpEnabled: boolean;
  pixGateway: string | null;
  cardGateway: string | null;
  cardPublicConfig: Record<string, string>;
  /** Cartão visível com as parcelas, mas sem gateway: a opção avisa e leva ao Pix (`checkout.cardComingSoon`). */
  cardPending: boolean;
  quotesInitial: { pix: Quote; card: Quote };
  /** Cupom de teste vindo da URL (`?cupom=`), normalizado. Vazio sem cupom; o servidor decide se vale. */
  coupon: string;
  /** Suporte do rodapé: WhatsApp cadastrado no painel ou, sem ele, o e-mail do site (mesma regra da compra confirmada). */
  support: { href: string; external: boolean };
  /** `ads.consentRequired`: desligado, o banner de cookies não aparece e os identificadores de anúncio vão sempre. */
  consentRequired: boolean;
}

export async function loadCheckoutProps(pack: CheckoutPack, bump: boolean, couponRaw?: string): Promise<{ mode: "proprio" | "zedy"; props: CheckoutServerProps }> {
  const s = await getSettings(["checkout.mode", "checkout.maxInstallments", "checkout.pixTtlSeconds", "checkout.bumpEnabled", "checkout.cardComingSoon", "ads.consentRequired"] as const);
  const mode = s["checkout.mode"] === "zedy" ? "zedy" : "proprio";
  const maxInstallments = Math.max(1, Math.min(12, Math.trunc(s["checkout.maxInstallments"])));
  const bumpEnabled = s["checkout.bumpEnabled"];
  const pixTtlSeconds = s["checkout.pixTtlSeconds"];
  const coupon = normalizeCoupon(couponRaw).slice(0, 40);

  const [pixGw, cardGw] = await Promise.all([gatewayFor("pix"), gatewayFor("card")]);
  const [quotesInitial, theme, whatsapp] = await Promise.all([quoteBoth(pack, bumpEnabled && bump, maxInstallments, coupon), getTheme(), getSupportWhatsapp()]);
  const support = whatsapp ? { href: whatsapp.href, external: true } : { href: `mailto:${CONTACT_EMAIL}`, external: false };
  const cardPublicConfig = cardGw ? await cardGw.publicConfig() : {};

  const methods: ("pix" | "card")[] = [];
  if (pixGw) methods.push("pix");
  const cardPending = !cardGw && !!pixGw && s["checkout.cardComingSoon"];
  if (cardGw || cardPending) methods.push("card");

  return {
    mode,
    props: { theme, methods, maxInstallments, pixTtlSeconds, bumpEnabled, pixGateway: pixGw?.name ?? null, cardGateway: cardGw?.name ?? null, cardPublicConfig, cardPending, quotesInitial, coupon, support, consentRequired: s["ads.consentRequired"] !== false },
  };
}
