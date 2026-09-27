"use client";

import { useEffect, useState } from "react";

/**
 * Relógio do cliente (origem `useClock`): `null` até montar (evita diferença de hidratação), depois atualiza a
 * cada 1 s. O primeiro tick sai de um timeout 0 para não fazer setState síncrono dentro do efeito.
 */
export function useClock(active = true): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [active]);
  return now;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** Texto da validade do Pix a partir de `checkout.pixTtlSeconds` (600 → "10 minutos"). Nunca um prazo fixo no código. */
export function ttlLabel(seconds: number): string {
  if (seconds >= 120) {
    const min = Math.round(seconds / 60);
    return `${min} minutos`;
  }
  return `${seconds} segundos`;
}
