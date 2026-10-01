"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, type ReactNode } from "react";
import { COLOR_LABELS } from "@/lib/site/constants";
import { KitSwatches } from "./ColorSwatches";
import { scrollBehavior } from "./media-query";
import { kitFocusTarget, revealFocus, useSelection } from "./SelectionProvider";

type StepsContext = "desktop" | "offer";
type StepState = "current" | "done" | "pending";

const STEPS = [0, 1] as const;
const ORDINAL = ["primeiro", "segundo"] as const;
const TITLE = ["Primeiro brinquedo", "Segundo brinquedo"] as const;
const SHORT = ["Primeiro", "Segundo"] as const;
/** Chamada que pulsa no passo atual (pedido do dono, 26/09): guia 1a -> 2a opcao antes de liberar o kit. */
const CUE = ["Escolha a primeira opção", "Escolha a segunda opção"] as const;
/** Card de oferta (dono, 01/10): depois de tocar no kit, o guia desce para as 3 fotos do passo atual. */
const SWATCH_CUE = ["Escolha uma dessas opções", "Escolha a segunda opção"] as const;
const SWATCH_LABEL: Record<StepsContext, readonly [string, string]> = {
  desktop: ["Cor do 1º AquaBlast no desktop", "Cor do 2º AquaBlast no desktop"],
  offer: ["Cor do 1º AquaBlast do kit na oferta", "Cor do 2º AquaBlast do kit na oferta"],
};

/**
 * Escolha das duas cores do kit em passos: so o passo atual fica aberto (3 cores); o passo feito vira
 * um resumo com "Trocar"; o passo seguinte fica pendente ate o anterior ter cor. O estado (qual passo
 * esta aberto) vem do SelectionProvider, entao painel desktop e card de oferta ficam sempre iguais;
 * o foco so se move na instancia em que a pessoa clicou.
 */
export function KitColorSteps({ context }: { context: StepsContext }) {
  const { pack, kitColors, kitConfirmed, kitReady, kitStep, reopenKitStep } = useSelection();
  const rootRef = useRef<HTMLDivElement>(null);

  // O botao clicado some (o passo fecha): o foco vai ao proximo passo ou, com o kit pronto, ao Comprar.
  const focusAfterPick = () => {
    const root = rootRef.current;
    if (!root) return;
    const next = kitFocusTarget(root);
    const buy = root.closest(".price-card, .desktop-product-panel")?.querySelector<HTMLElement>('[data-purchase="kit"]');
    // Card de oferta (dono, 01/10; celular e computador): com as 2 cores, a tela rola ate o "Comprar kit com 2".
    if (!next && buy && context === "offer") {
      buy.focus({ preventScroll: true });
      buy.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
      return;
    }
    const target = next ?? buy;
    if (target) revealFocus(target);
  };

  // "Trocar" some junto com o resumo: o foco vai a cor escolhida do passo reaberto.
  const reopen = (index: 0 | 1) => {
    reopenKitStep(index);
    const target = kitFocusTarget(rootRef.current);
    if (target) revealFocus(target);
  };

  const stateOf = (index: 0 | 1): StepState =>
    kitStep === index ? "current" : kitConfirmed[index] ? "done" : "pending";

  const steps = STEPS.map((index) => {
    const state = stateOf(index);
    const number = <b aria-hidden={state === "done" || undefined}>{state === "done" ? "✓" : index + 1}</b>;
    const cue = (
      <span className="kit-step-cue" aria-hidden="true">
        {CUE[index]}
      </span>
    );

    let body: ReactNode;
    if (state === "current") {
      // Card de oferta (pedido do dono, 27/09): a chamada vira balao de comentario em cima do numero do passo.
      body = (
        <div className={context === "desktop" ? "desktop-kit-color kit-step-body" : "kit-color-row kit-step-body"}>
          {context === "desktop" && cue}
          <span className={context === "desktop" ? "desktop-field-label" : "choice-row-label"}>
            {context === "desktop" ? (
              number
            ) : (
              <b>
                {index + 1}
                {cue}
              </b>
            )}
            <span>
              {TITLE[index]}
              <small>Escolha a cor</small>
            </span>
          </span>
          <KitSwatches
            index={index}
            label={SWATCH_LABEL[context][index]}
            onPick={focusAfterPick}
            cue={context === "offer" ? SWATCH_CUE[index] : undefined}
          />
        </div>
      );
    } else if (state === "done") {
      const colorLabel = COLOR_LABELS[kitColors[index]];
      body = (
        <div className="kit-step-summary">
          {number}
          <img
            className="kit-step-thumb"
            src={`/thumbs/produto-${kitColors[index]}-110.webp`}
            alt=""
            width={110}
            height={110}
            decoding="async"
          />
          <span className="kit-step-text">
            {SHORT[index]}: <strong>{colorLabel}</strong>
          </span>
          <button
            type="button"
            className="kit-step-change"
            aria-label={`Trocar a cor do ${ORDINAL[index]} brinquedo (${colorLabel})`}
            onClick={() => reopen(index)}
          >
            Trocar
          </button>
        </div>
      );
    } else {
      body = (
        <div className="kit-step-summary">
          {number}
          <span className="kit-step-text">
            {TITLE[index]}
            <small>Escolha depois do primeiro</small>
          </span>
        </div>
      );
    }

    return (
      <div key={index} className="kit-step" data-kit-step={index} data-step-state={state}>
        {body}
      </div>
    );
  });

  if (context === "desktop") {
    return (
      <div
        ref={rootRef}
        className="desktop-kit-selection kit-steps"
        data-desktop-colors="kit"
        data-kit-ready={kitReady || undefined}
        data-active={pack === "kit" || undefined}
        hidden={pack !== "kit"}
      >
        {steps}
      </div>
    );
  }
  return (
    <div
      ref={rootRef}
      className="kit-color-selectors kit-steps"
      data-kit-ready={kitReady || undefined}
      data-active={pack === "kit" || undefined}
    >
      {steps}
    </div>
  );
}
