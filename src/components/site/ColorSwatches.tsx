"use client";
/* eslint-disable @next/next/no-img-element */

import { COLOR_KEYS, COLOR_LABELS } from "@/lib/site/constants";
import type { Color } from "@/lib/site/types";
import { useSelection } from "./SelectionProvider";

/** Botões `[data-color]`: escolhem a cor da unidade. */
export function UnitSwatches({ label }: { label: string }) {
  const { color, chooseColor } = useSelection();
  return (
    <div className="swatches" role="group" aria-label={label}>
      {COLOR_KEYS.map((key) => (
        <button
          key={key}
          className="color-product-choice"
          data-color={key}
          aria-label={COLOR_LABELS[key]}
          aria-pressed={color === key}
          onClick={() => chooseColor(key)}
        >
          <img src={`/produto-${key}.webp`} alt="" />
          <span>{COLOR_LABELS[key]}</span>
        </button>
      ))}
    </div>
  );
}

/** Botões `[data-kit-color]`: escolhem a cor de um dos dois AquaBlast do kit. */
export function KitSwatches({ index, label }: { index: 0 | 1; label: string }) {
  const { kitColors, selectKitColor } = useSelection();
  return (
    <div className="swatches" role="group" aria-label={label}>
      {COLOR_KEYS.map((key: Color) => (
        <button
          key={key}
          className="color-product-choice"
          data-kit-index={index}
          data-kit-color={key}
          aria-label={COLOR_LABELS[key]}
          aria-pressed={kitColors[index] === key}
          onClick={() => selectKitColor(index, key)}
        >
          <img src={`/produto-${key}.webp`} alt="" />
          <span>{COLOR_LABELS[key]}</span>
        </button>
      ))}
    </div>
  );
}
