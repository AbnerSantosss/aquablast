"use client";

import { useEffect } from "react";

/** Ao dar play em um vídeo, pausa todos os outros (comportamento do app.js). */
export function SiteBehavior() {
  useEffect(() => {
    const onPlay = (event: Event) => {
      const current = event.target;
      if (!(current instanceof HTMLVideoElement)) return;
      document.querySelectorAll("video").forEach((other) => {
        if (other !== current) other.pause();
      });
    };
    document.addEventListener("play", onPlay, true);
    return () => document.removeEventListener("play", onPlay, true);
  }, []);
  return null;
}
