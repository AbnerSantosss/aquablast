import { gatewayFor } from "@/lib/gateways";
import { getSettings } from "@/lib/settings";
import type { CheckoutPack } from "./catalog";
import { quoteBoth, type Quote } from "./pricing";
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
  bumpEnabled: boolean;
  pixGateway: string | null;
  cardGateway: string | null;
  cardPublicConfig: Record<string, string>;
  quotesInitial: { pix: Quote; card: Quote };
}

export async function loadCheckoutProps(pack: CheckoutPack, bump: boolean): Promise<{ mode: "proprio" | "zedy"; props: CheckoutServerProps }> {
  const s = await getSettings(["checkout.mode", "checkout.maxInstallments", "checkout.bumpEnabled"] as const);
  const mode = s["checkout.mode"] === "zedy" ? "zedy" : "proprio";
  const maxInstallments = Math.max(1, Math.min(12, Math.trunc(s["checkout.maxInstallments"])));
  const bumpEnabled = s["checkout.bumpEnabled"];

  const [pixGw, cardGw] = await Promise.all([gatewayFor("pix"), gatewayFor("card")]);
  const [quotesInitial, theme] = await Promise.all([quoteBoth(pack, bumpEnabled && bump, maxInstallments), getTheme()]);
  const cardPublicConfig = cardGw ? await cardGw.publicConfig() : {};

  const methods: ("pix" | "card")[] = [];
  if (pixGw) methods.push("pix");
  if (cardGw) methods.push("card");

  return {
    mode,
    props: { theme, methods, maxInstallments, bumpEnabled, pixGateway: pixGw?.name ?? null, cardGateway: cardGw?.name ?? null, cardPublicConfig, quotesInitial },
  };
}
