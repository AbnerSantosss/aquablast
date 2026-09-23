"use client";

import { useSyncExternalStore } from "react";

const subscribe = (query: string) => (onChange: () => void) => {
  const list = window.matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
};

const subscribers = new Map<string, (onChange: () => void) => () => void>();

/** `matchMedia(query).matches` como store; no servidor sempre `false`. */
export function useMediaQuery(query: string): boolean {
  let sub = subscribers.get(query);
  if (!sub) {
    sub = subscribe(query);
    subscribers.set(query, sub);
  }
  return useSyncExternalStore(
    sub,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
