"use client";

import { createContext, useContext, type ReactNode } from "react";
import { FALLBACK_SITE_PRICES, type SitePrices } from "@/lib/site/prices";

const PricesContext = createContext<SitePrices>(FALLBACK_SITE_PRICES);

/** Entrega aos blocos de compra os preços que a página leu do painel (getSitePrices). */
export function PricesProvider({ value, children }: { value: SitePrices; children: ReactNode }) {
  return <PricesContext.Provider value={value}>{children}</PricesContext.Provider>;
}

export const usePrices = () => useContext(PricesContext);
