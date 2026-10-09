import type { Pack } from "@/lib/site/types";

/**
 * Precos do site publico, derivados dos MESMOS centavos que o checkout cobra (`checkout.prices` e
 * `checkout.maxInstallments`, tela /admin/produtos). Ate 07/10/2026 a LP usava textos fixos em
 * `constants.ts` ("R$ 159,90", "R$ 14,99"...) que precisavam ser mantidos a mao iguais ao painel; agora
 * parcela, desconto do Pix e economia do kit saem de uma conta so. Este arquivo e puro (sem banco):
 * serve para componente de cliente e de servidor. A leitura do painel fica em `prices-server.ts`.
 *
 * Historico dos valores: 27/09 parcela do cartao em destaque e Pix R$ 10 mais barato
 * (wiki: pedidos/2026-09-27-preco-parcela-destaque); 03/10 (dono: "nosso foco e pagamento no Pix") o cartao
 * subiu R$ 10 na unidade e R$ 20 no kit, entao o desconto do Pix passou a R$ 20 / R$ 30.
 */
export type PriceCents = Record<Pack, { pix: number; card: number }>;

/**
 * Reserva usada quando o painel nao responde (o `next build` do CI nao tem banco). Tem de ser igual ao
 * valor inicial de `checkout.prices` em `settings.ts`; `scripts/verify-checkout-ux.cjs` confere.
 */
export const FALLBACK_PRICE_CENTS: PriceCents = { unit: { pix: 14990, card: 17990 }, kit: { pix: 23990, card: 26990 } };
export const FALLBACK_MAX_INSTALLMENTS = 12;

export interface PackPrice {
  /** Valor de cada parcela no cartao, sem juros. */
  installment: string;
  card: string;
  pix: string;
  /** Diferenca cartao - Pix; "" quando os dois custam o mesmo. */
  pixDiscount: string;
  /** Preco no Pix (o menor) em reais, para o JSON-LD. */
  amount: number;
}

export interface SitePrices extends Record<Pack, PackPrice> {
  /** Economia do kit contra 2 unidades, no Pix; "" quando o kit nao sai mais barato. */
  kitSaving: string;
  /** Duas unidades avulsas no Pix; "" quando o kit nao sai mais barato. */
  kitUnitsTotal: string;
  /** Numero de parcelas anunciado (`checkout.maxInstallments`). */
  installments: number;
}

/** "R$ 159,90" com espaco comum, igual aos textos que a pagina ja mostrava. `whole`: "R$ 20" quando nao ha centavos. */
function brl(cents: number, whole = false): string {
  const reais = Math.trunc(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const rest = cents % 100;
  return whole && rest === 0 ? `R$ ${reais}` : `R$ ${reais},${String(rest).padStart(2, "0")}`;
}

function packPrice(p: { pix: number; card: number }, installments: number): PackPrice {
  return {
    installment: brl(Math.round(p.card / installments)), // mesmo arredondamento do checkout (pricing.ts)
    card: brl(p.card),
    pix: brl(p.pix),
    pixDiscount: p.card > p.pix ? brl(p.card - p.pix, true) : "",
    amount: p.pix / 100,
  };
}

const isCents = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/** Formato conferido antes de ir para a pagina: valor estranho no banco nunca vira preco anunciado. */
export function isPriceCents(v: unknown): v is PriceCents {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<Record<Pack, Partial<{ pix: unknown; card: unknown }>>>;
  return isCents(p.unit?.pix) && isCents(p.unit?.card) && isCents(p.kit?.pix) && isCents(p.kit?.card);
}

export function buildSitePrices(cents: PriceCents, maxInstallments: number): SitePrices {
  const installments = Number.isInteger(maxInstallments) && maxInstallments >= 1 ? maxInstallments : 1;
  const saving = cents.unit.pix * 2 - cents.kit.pix;
  return {
    unit: packPrice(cents.unit, installments),
    kit: packPrice(cents.kit, installments),
    kitSaving: saving > 0 ? brl(saving) : "",
    kitUnitsTotal: saving > 0 ? brl(cents.unit.pix * 2) : "",
    installments,
  };
}

export const FALLBACK_SITE_PRICES: SitePrices = buildSitePrices(FALLBACK_PRICE_CENTS, FALLBACK_MAX_INSTALLMENTS);
