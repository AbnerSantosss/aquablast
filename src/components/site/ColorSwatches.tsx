"use client";
/* eslint-disable @next/next/no-img-element */

import { COLOR_KEYS, COLOR_LABELS } from "@/lib/site/constants";
import type { Color } from "@/lib/site/types";
import { useSelection } from "./SelectionProvider";

/**
 * Etiqueta "Escolha a cor" presa na borda do bloco de cor da unidade enquanto nenhuma cor foi escolhida
 * de forma explicita (colorTouched). Mesmo desenho da etiqueta dos passos do kit (.kit-step-cue).
 */
export function UnitColorCue() {
  const { colorTouched } = useSelection();
  if (colorTouched) return null;
  return (
    <span className="kit-step-cue" aria-hidden="true">
      Escolha a cor
    </span>
  );
}

/** Botões `[data-color]`: escolhem a cor da unidade. Nenhum aparece marcado antes da primeira escolha. */
export function UnitSwatches({ label }: { label: string }) {
  const { color, colorTouched, chooseColor } = useSelection();
  return (
    <div className="swatches" role="group" aria-label={label}>
      {COLOR_KEYS.map((key) => (
        <button
          key={key}
          className="color-product-choice"
          data-color={key}
          aria-label={COLOR_LABELS[key]}
          aria-pressed={colorTouched && color === key}
          onClick={() => chooseColor(key)}
        >
          <img src={`/thumbs/produto-${key}-110.webp`} alt="" loading="lazy" decoding="async" />
          <span>{COLOR_LABELS[key]}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Botões `[data-kit-color]`: escolhem a cor de um dos dois AquaBlast do kit.
 * `onPick` roda depois do commit (flushSync), com o DOM ja atualizado, para mover o foco.
 */
export function KitSwatches({
  index,
  label,
  onPick,
  cue,
}: {
  index: 0 | 1;
  label: string;
  onPick?: (color: Color) => void;
  /** Balao do guia sobre as 3 fotos do card de oferta (ver mobile-ordem-venda.css). */
  cue?: string;
}) {
  const { kitColors, kitConfirmed, selectKitColor } = useSelection();
  return (
    <div className="swatches" role="group" aria-label={label}>
      {cue ? (
        <span className="kit-swatch-cue" aria-hidden="true">
          {cue}
        </span>
      ) : null}
      {COLOR_KEYS.map((key: Color) => (
        <button
          key={key}
          className="color-product-choice"
          data-kit-index={index}
          data-kit-color={key}
          // 2o passo: marca a cor do 1o para o guia sugerir outra (continua clicavel).
          data-taken={index === 1 && kitConfirmed[0] && kitColors[0] === key ? "" : undefined}
          aria-label={COLOR_LABELS[key]}
          aria-pressed={kitConfirmed[index] && kitColors[index] === key}
          onClick={() => {
            selectKitColor(index, key);
            onPick?.(key);
          }}
        >
          <img src={`/thumbs/produto-${key}-110.webp`} alt="" loading="lazy" decoding="async" />
          <span>{COLOR_LABELS[key]}</span>
        </button>
      ))}
    </div>
  );
}
