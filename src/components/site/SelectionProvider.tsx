"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { COLOR_KEYS, COLOR_LABELS, DESKTOP_QUERY, productPhotoIndex } from "@/lib/site/constants";
import type { Color, Pack } from "@/lib/site/types";
import { scrollBehavior } from "./media-query";

interface SelectionState {
  color: Color;
  pack: Pack;
  kitColors: [Color, Color];
  kitConfirmed: [boolean, boolean];
  heroPhoto: number;
  /** true enquanto o vídeo de destaque ocupa a galeria (estado inicial do app.js). */
  videoActive: boolean;
  /** Incrementa a cada selectHeroVideo() para reexecutar play() como no original. */
  videoRequest: number;
  /** setHeroPhoto() já rodou alguma vez (o rótulo/aria da foto só mudam a partir daí). */
  heroTouched: boolean;
  /** chooseColor() já rodou alguma vez (o alt das .unit-product só muda a partir daí). */
  colorTouched: boolean;
}

export interface SelectionContextValue extends SelectionState {
  isCustomKit: boolean;
  kitReady: boolean;
  kitName: string;
  kitAlt: string;
  chooseColor: (color: Color) => void;
  selectPack: (pack: Pack) => void;
  selectKitColor: (index: 0 | 1, color: Color) => void;
  selectHeroOption: (index: number) => void;
  selectHeroVideo: () => void;
  selectOffer: () => void;
}

const initialState: SelectionState = {
  color: "azul",
  pack: "unit",
  kitColors: ["azul", "preto"],
  kitConfirmed: [false, false],
  heroPhoto: 0,
  videoActive: true,
  videoRequest: 0,
  heroTouched: false,
  colorTouched: false,
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

function scrollToCard(pack: Pack) {
  const card = document.querySelector<HTMLElement>(`[data-price-card="${pack}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  card.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true });
}

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SelectionState>(initialState);
  const stateRef = useRef(state);

  /** Aplica o novo estado de forma síncrona, para que consultas ao DOM logo após vejam o resultado. */
  const commit = useCallback((update: (previous: SelectionState) => SelectionState) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    flushSync(() => setState(next));
  }, []);

  const withHeroPhoto = (previous: SelectionState, index: number): SelectionState => ({
    ...previous,
    heroPhoto: index,
    videoActive: false,
    heroTouched: true,
  });

  const chooseColor = useCallback(
    (color: Color) => {
      commit((previous) =>
        withHeroPhoto({ ...previous, color, pack: "unit", colorTouched: true }, productPhotoIndex(color)),
      );
    },
    [commit],
  );

  const selectPack = useCallback(
    (pack: Pack) => {
      commit((previous) =>
        withHeroPhoto({ ...previous, pack }, pack === "kit" ? 1 : productPhotoIndex(previous.color)),
      );
    },
    [commit],
  );

  const selectKitColor = useCallback(
    (index: 0 | 1, color: Color) => {
      commit((previous) => {
        const kitColors: [Color, Color] = [previous.kitColors[0], previous.kitColors[1]];
        kitColors[index] = color;
        const kitConfirmed: [boolean, boolean] = [...previous.kitConfirmed];
        kitConfirmed[index] = true;
        return withHeroPhoto({ ...previous, kitColors, kitConfirmed, pack: "kit" }, 1);
      });
    },
    [commit],
  );

  const selectHeroOption = useCallback(
    (index: number) => {
      if (index === 1) selectPack("kit");
      else if (index === 0) selectPack("unit");
      else chooseColor(COLOR_KEYS[index - 2]);
      const pack = stateRef.current.pack;
      if (window.matchMedia(DESKTOP_QUERY).matches) {
        const panel = document.querySelector<HTMLElement>(".desktop-product-panel");
        if (!panel) return;
        const bounds = panel.getBoundingClientRect();
        if (bounds.top < 70 || bounds.bottom > window.innerHeight) {
          panel.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
        }
        document
          .querySelector<HTMLElement>(`[data-desktop-colors="${pack}"] button[aria-pressed="true"]`)
          ?.focus({ preventScroll: true });
        return;
      }
      scrollToCard(pack);
    },
    [chooseColor, selectPack],
  );

  const selectHeroVideo = useCallback(() => {
    const next: SelectionState = {
      ...stateRef.current,
      videoActive: true,
      videoRequest: stateRef.current.videoRequest + 1,
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const selectOffer = useCallback(() => {
    scrollToCard(stateRef.current.pack);
  }, []);

  const value = useMemo<SelectionContextValue>(() => {
    const [first, second] = state.kitColors;
    return {
      ...state,
      kitReady: state.kitConfirmed.every(Boolean),
      isCustomKit: first !== "azul" || second !== "preto",
      kitName: `Kit ${state.kitColors.map((c) => COLOR_LABELS[c]).join(" + ")}`,
      kitAlt: `Kit com dois AquaBlast: ${state.kitColors.map((c) => COLOR_LABELS[c]).join(" e ")}`,
      chooseColor,
      selectPack,
      selectKitColor,
      selectHeroOption,
      selectHeroVideo,
      selectOffer,
    };
  }, [state, chooseColor, selectPack, selectKitColor, selectHeroOption, selectHeroVideo, selectOffer]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (!context) throw new Error("useSelection precisa estar dentro de <SelectionProvider>.");
  return context;
}
