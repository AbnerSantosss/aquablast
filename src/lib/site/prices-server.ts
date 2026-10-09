import { cache } from "react";
import { getSettings } from "@/lib/settings";
import { buildSitePrices, FALLBACK_SITE_PRICES, isPriceCents, type SitePrices } from "@/lib/site/prices";
import { withTimeout } from "@/lib/site/support-contact";

/** Sem resposta do banco nesse tempo, a página sai com os preços de reserva (não trava o render). */
const DB_TIMEOUT_MS = 3000;

/**
 * Preços do site lidos do painel (/admin/produtos), os mesmos que `quote()` cobra no checkout.
 * Qualquer erro ou valor fora do formato cai na reserva de `prices.ts`: no `next build` do CI não há
 * banco, a página estática sai com a reserva e o ISR (ou o salvar do painel) troca pelos valores reais.
 * `cache` do React: uma leitura por render, mesmo se chamado em mais de um lugar.
 */
export const getSitePrices = cache(async (): Promise<SitePrices> => {
  try {
    const s = await withTimeout(getSettings(["checkout.prices", "checkout.maxInstallments"] as const), DB_TIMEOUT_MS);
    const cents = s["checkout.prices"];
    return isPriceCents(cents) ? buildSitePrices(cents, s["checkout.maxInstallments"]) : FALLBACK_SITE_PRICES;
  } catch {
    return FALLBACK_SITE_PRICES;
  }
});
