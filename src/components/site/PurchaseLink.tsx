"use client";

import { useId, type ReactNode } from "react";
import { checkoutUrl } from "@/lib/site/constants";
import type { Pack } from "@/lib/site/types";
import { kitFocusTarget, revealFocus, useSelection } from "./SelectionProvider";

/** No checkout URL exists until the unit color, or both kit colors, have been explicitly chosen. */
export function PurchaseLink({ pack, className, children }: { pack: Pack; className: string; children: ReactNode }) {
  const { color, colorTouched, kitColors, kitConfirmed, kitReady, reopenKitStep } = useSelection();
  const hintId = useId();
  const blocked = pack === "kit" ? !kitReady : !colorTouched;
  const missing = kitConfirmed[0] ? 1 : 0;
  const kitHint = !kitConfirmed[0] && !kitConfirmed[1]
    ? "Escolha a cor do primeiro e do segundo brinquedo para continuar."
    : `Falta escolher a cor do ${missing === 0 ? "primeiro" : "segundo"} brinquedo.`;
  const hint = pack === "kit"
    ? blocked ? kitHint : "Duas cores escolhidas. Seu kit está pronto!"
    : blocked ? "Escolha a cor do seu AquaBlast para continuar." : "Cor escolhida. É só comprar!";

  /**
   * Escolha incompleta: leva o foco a cor que falta (so rola se estiver fora da tela). No kit, fecha antes
   * um "Trocar" aberto e vai ao passo atual; na unidade, vai a primeira cor.
   */
  const focusMissingChoice = (link: HTMLAnchorElement) => {
    const container = link.closest(".price-card, .desktop-product-panel");
    if (pack !== "kit") {
      const first = container?.querySelector<HTMLButtonElement>("button[data-color]");
      if (first) revealFocus(first);
      return;
    }
    reopenKitStep(null);
    const target =
      kitFocusTarget(container) ??
      container?.querySelector<HTMLButtonElement>(`button[data-kit-index="${missing}"]`);
    if (target) revealFocus(target);
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
      <p id={hintId} className="kit-selection-hint" role="status">{hint}</p>
    </>
  );
}
