"use client";

import { useId, type ReactNode } from "react";
import { checkoutUrl } from "@/lib/site/constants";
import type { Pack } from "@/lib/site/types";
import { useSelection } from "./SelectionProvider";

/** No checkout URL exists until both kit colors have been explicitly chosen. */
export function PurchaseLink({ pack, className, children }: { pack: Pack; className: string; children: ReactNode }) {
  const { color, kitColors, kitConfirmed, kitReady } = useSelection();
  const hintId = useId();
  const blocked = pack === "kit" && !kitReady;
  const missing = kitConfirmed[0] ? 1 : 0;
  const hint = !kitConfirmed[0] && !kitConfirmed[1]
    ? "Escolha a cor do primeiro e do segundo brinquedo para continuar."
    : `Falta escolher a cor do ${missing === 0 ? "primeiro" : "segundo"} brinquedo.`;

  const focusMissingChoice = (link: HTMLAnchorElement) => {
    link.closest(".price-card, .desktop-product-panel")
      ?.querySelector<HTMLButtonElement>(`button[data-kit-index="${missing}"]`)
      ?.focus();
  };

  return (
    <>
      <a
        className={className}
        data-purchase={pack}
        href={blocked ? undefined : checkoutUrl(pack, color, kitColors)}
        role="link"
        tabIndex={0}
        aria-disabled={blocked || undefined}
        aria-describedby={blocked ? hintId : undefined}
        onClick={(event) => {
          if (!blocked) return;
          event.preventDefault();
          focusMissingChoice(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (blocked && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            focusMissingChoice(event.currentTarget);
          }
        }}
      >
        {children}
      </a>
      {pack === "kit" && <p id={hintId} className="kit-selection-hint" role="status">{blocked ? hint : "Duas cores escolhidas. Seu kit está pronto!"}</p>}
    </>
  );
}
