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
  /** Passo do kit reaberto por "Trocar" (so um passo expandido por vez); null = segue a ordem. */
  kitReopened: 0 | 1 | null;
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
  /** Passo do kit expandido: o reaberto, senao o primeiro sem cor confirmada; null = os dois prontos. */
  kitStep: 0 | 1 | null;
  kitName: string;
  kitAlt: string;
  chooseColor: (color: Color) => void;
  selectPack: (pack: Pack) => void;
  /** So troca o pacote (compra direta do topo do celular): nao mexe na foto/video nem rola a pagina. */
  setPack: (pack: Pack) => void;
  selectKitColor: (index: 0 | 1, color: Color) => void;
  reopenKitStep: (index: 0 | 1 | null) => void;
  selectHeroOption: (index: number) => void;
  selectHeroVideo: () => void;
  selectOffer: () => void;
}

const initialState: SelectionState = {
  color: "azul",
  pack: "kit",
  kitColors: ["azul", "preto"],
  kitConfirmed: [false, false],
  kitReopened: null,
  heroPhoto: 0,
  videoActive: false,
  videoRequest: 0,
  heroTouched: false,
  colorTouched: false,
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

/**
 * Foca sem pulo de rolagem; so rola (o minimo, respeitando reduced-motion) se o alvo estiver fora da
 * area visivel. O topo desconta o scroll-padding-top do html (header fixo).
 */
export function revealFocus(target: HTMLElement) {
  target.focus({ preventScroll: true });
  const bounds = target.getBoundingClientRect();
  const top = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  if (bounds.top < top || bounds.bottom > window.innerHeight) {
    target.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
  }
}

/** Controle operavel do passo atual do kit dentro de `root`: o swatch pressionado ou o primeiro. */
export function kitFocusTarget(root: ParentNode | null | undefined): HTMLElement | null {
  const step = root?.querySelector<HTMLElement>('.kit-step[data-step-state="current"]');
  if (!step) return null;
  return (
    step.querySelector<HTMLElement>('button[aria-pressed="true"]') ?? step.querySelector<HTMLElement>("button")
  );
}

/** Onde o foco vai ao chegar nas escolhas: kit -> passo atual (ou o 1o controle); unidade -> cor pressionada (ou a 1a). */
function choiceFocusTarget(root: ParentNode | null, pack: Pack): HTMLElement | null {
  if (!root) return null;
  if (pack === "kit") return kitFocusTarget(root) ?? root.querySelector<HTMLElement>(".kit-step button");
  return (
    root.querySelector<HTMLElement>('button[aria-pressed="true"]') ?? root.querySelector<HTMLElement>("button[data-color]")
  );
}

function scrollToCard(pack: Pack) {
  const card = document.querySelector<HTMLElement>(`[data-price-card="${pack}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  choiceFocusTarget(card, pack)?.focus({ preventScroll: true });
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

  /**
   * Foto que representa "1 unidade": campanha (0) enquanto a pessoa nao escolheu uma cor de forma
   * explicita (colorTouched), produto-<cor> depois. E exatamente o que a miniatura 0 mostra
   * (Hero.tsx), entao selectPack("unit") tem de usar esta foto em vez de saltar direto para o
   * produto - senao a pessoa clica na miniatura com a arte de campanha e o destaque troca para
   * outra imagem (armadilha de 26/09, pedido do dono).
   */
  const unitPhotoIndex = (previous: SelectionState): number =>
    previous.colorTouched ? productPhotoIndex(previous.color) : 0;

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
        withHeroPhoto({ ...previous, pack }, pack === "kit" ? 1 : unitPhotoIndex(previous)),
      );
    },
    [commit],
  );

  const setPack = useCallback(
    (pack: Pack) => {
      if (stateRef.current.pack === pack) return;
      commit((previous) => ({ ...previous, pack }));
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
        return withHeroPhoto({ ...previous, kitColors, kitConfirmed, kitReopened: null, pack: "kit" }, 1);
      });
    },
    [commit],
  );

  /** "Trocar" reabre um passo ja confirmado; null fecha o reaberto e volta para a ordem 1o -> 2o. */
  const reopenKitStep = useCallback(
    (index: 0 | 1 | null) => {
      if (index !== null && !stateRef.current.kitConfirmed[index]) return;
      if (stateRef.current.kitReopened === index) return;
      commit((previous) => ({ ...previous, kitReopened: index }));
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
        choiceFocusTarget(document.querySelector(`[data-desktop-colors="${pack}"]`), pack)?.focus({
          preventScroll: true,
        });
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
    const firstMissing = state.kitConfirmed.indexOf(false);
    return {
      ...state,
      kitReady: state.kitConfirmed.every(Boolean),
      kitStep: state.kitReopened ?? (firstMissing === 0 || firstMissing === 1 ? firstMissing : null),
      isCustomKit: first !== "azul" || second !== "preto",
      kitName: `Kit ${state.kitColors.map((c) => COLOR_LABELS[c]).join(" + ")}`,
      kitAlt: `Kit com dois AquaBlast: ${state.kitColors.map((c) => COLOR_LABELS[c]).join(" e ")}`,
      chooseColor,
      selectPack,
      setPack,
      selectKitColor,
      reopenKitStep,
      selectHeroOption,
      selectHeroVideo,
      selectOffer,
    };
  }, [state, chooseColor, selectPack, setPack, selectKitColor, reopenKitStep, selectHeroOption, selectHeroVideo, selectOffer]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (!context) throw new Error("useSelection precisa estar dentro de <SelectionProvider>.");
  return context;
}
