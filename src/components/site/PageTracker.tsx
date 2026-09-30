"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    /** Ids do PageView/ViewContent desta página (page-event-ids.ts, no layout do site). O GTM lê os mesmos. */
    aqbEvt?: { pv: string; vc: string };
  }
}

/** Espera o Pixel criar o cookie _fbp (até ~4 s) para o servidor mandar o mesmo fbp que o navegador. */
const WAIT_STEP_MS = 500;
const WAIT_STEPS = 8;

/** Avisa o servidor da visita (POST /api/track/page), uma vez por carregamento de página. Invisível. */
export function PageTracker() {
  useEffect(() => {
    const ids = window.aqbEvt;
    if (!ids) return;
    let sent = false;
    let tries = 0;
    let timer: number | undefined;

    const send = () => {
      if (sent) return;
      sent = true;
      window.clearTimeout(timer);
      const body = JSON.stringify({ pv: ids.pv, vc: window.location.pathname === "/" ? ids.vc : undefined, url: window.location.href });
      fetch("/api/track/page", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => undefined);
    };
    const waitPixel = () => {
      if (document.cookie.includes("_fbp=") || ++tries > WAIT_STEPS) send();
      else timer = window.setTimeout(waitPixel, WAIT_STEP_MS);
    };

    // Quem sai antes dos 4 s ainda conta como visita.
    window.addEventListener("pagehide", send);
    waitPixel();
    return () => {
      window.removeEventListener("pagehide", send);
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
