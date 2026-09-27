"use client";

import { useId, useState, type ReactNode } from "react";
import { COLOR_LABELS, checkoutUrl } from "@/lib/site/constants";
import type { Pack } from "@/lib/site/types";
import { kitFocusTarget, revealFocus, useSelection } from "./SelectionProvider";

/** Rotulo do Comprar quando a escolha esta completa (e o botao pulsa). */
const READY_LABEL: Record<Pack, string> = { unit: "Quero 1 unidade", kit: "Quero o kit com 2" };

/**
 * Comprar nunca trava (pedido do dono, 26/09): sempre tem link para o checkout. Com a escolha incompleta
 * (cor da unidade ou as duas cores do kit) o botao fica verde sem pulsar e o PRIMEIRO clique so avisa e
 * leva a cor que falta; o segundo segue com as cores que estao na tela. Escolha completa: pulsa e vira "Quero...".
 */
export function PurchaseLink({ pack, className, children }: { pack: Pack; className: string; children: ReactNode }) {
  const { color, colorTouched, kitColors, kitConfirmed, kitReady, reopenKitStep } = useSelection();
  const hintId = useId();
  const [warned, setWarned] = useState(false);
  const incomplete = pack === "kit" ? !kitReady : !colorTouched;
  const missing = kitConfirmed[0] ? 1 : 0;
  const fallback = pack === "kit" ? kitColors.map((c) => COLOR_LABELS[c]).join(" + ") : COLOR_LABELS[color];

  let hint: string;
  if (!incomplete) hint = pack === "kit" ? "Duas cores escolhidas. Seu kit está pronto!" : "Cor escolhida. É só comprar!";
  else if (warned) hint = `Escolha acima ou toque de novo para seguir com ${fallback}.`;
  else if (pack === "unit") hint = "Escolha a cor do seu AquaBlast e siga para o checkout.";
  else if (!kitConfirmed[0] && !kitConfirmed[1]) hint = "Escolha a cor do primeiro e do segundo brinquedo e siga.";
  else hint = `Falta escolher a cor do ${missing === 0 ? "primeiro" : "segundo"} brinquedo.`;

  /** Leva o foco a cor que falta (so rola se estiver fora da tela). No kit, fecha antes um "Trocar" aberto. */
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
        data-incomplete={incomplete || undefined}
        href={checkoutUrl(pack, color, kitColors)}
        aria-describedby={hintId}
        onClick={(event) => {
          if (!incomplete || warned) return;
          event.preventDefault();
          setWarned(true);
          focusMissingChoice(event.currentTarget);
        }}
      >
        {incomplete ? children : READY_LABEL[pack]}
      </a>
      <p id={hintId} className="kit-selection-hint" data-warned={(incomplete && warned) || undefined} role="status">
        {hint}
      </p>
    </>
  );
}
