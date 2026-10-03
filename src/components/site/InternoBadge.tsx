"use client";

import { useSyncExternalStore } from "react";
import { internoAtivo } from "@/lib/site/interno";

const subscribe = () => () => undefined;

/** Selo discreto "modo interno": so aparece no navegador que ligou `?interno=1` (GTM e Clarity desligados). */
export function InternoBadge() {
  const on = useSyncExternalStore(subscribe, internoAtivo, () => false);
  if (!on) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 4,
        left: 4,
        zIndex: 2147483000,
        padding: "2px 8px",
        borderRadius: 999,
        background: "rgba(6, 55, 96, 0.85)",
        color: "#fff",
        font: "700 10px/1.6 system-ui, sans-serif",
        letterSpacing: "0.04em",
        pointerEvents: "none",
      }}
    >
      modo interno
    </div>
  );
}
