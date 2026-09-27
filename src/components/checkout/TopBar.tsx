"use client";

import { Droplet, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { timeLeft, type Theme } from "@/lib/checkout/own/theme";

/** Logo do checkout (origem app/checkout.tsx, `Brand()`). Mesmo ícone de gota do site (SITE_ICON), via lucide-react. */
export function Brand({ storeName }: { storeName: string }) {
  return (
    <span className="brand">
      <Droplet aria-hidden="true" />
      {storeName}
    </span>
  );
}

/**
 * Cronômetro da oferta (origem app/checkout.tsx, `OfferTimer()`, via `useClock`/`timeLeft`).
 * `is-pending` fica visível=hidden no primeiro render (servidor x cliente podem calcular tempos
 * diferentes por alguns ms): só aparece depois do primeiro tick no navegador.
 */
export function OfferTimer({ theme }: { theme: Theme }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!theme.timerEnabled) return null;
  const left = now === null ? null : timeLeft(theme.timerEnd, now);
  if (now !== null && !left) return null; // oferta acabou: some (nenhum número inventado no lugar).

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className={`ck-timer${now === null ? " is-pending" : ""}`}>
      <Timer aria-hidden="true" size={15} />
      <span className="ck-timer-long">{theme.timerLabel}</span>
      {left ? (
        <b>
          {left.days > 0 ? `${left.days}d ` : ""}
          {pad(left.hours)}:{pad(left.minutes)}:{pad(left.seconds)}
        </b>
      ) : (
        <b>00:00:00</b>
      )}
    </div>
  );
}

/** Topo do checkout: marca + cronômetro (".ck-top", origem app/checkout.tsx). */
export function TopBar({ theme }: { theme: Theme }) {
  return (
    <header className="ck-top">
      <Brand storeName={theme.storeName} />
      <OfferTimer theme={theme} />
    </header>
  );
}
