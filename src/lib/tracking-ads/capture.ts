"use client";
// STUB: implementado por rastreamento.
// Lado do NAVEGADOR. Única função: ler identificadores de anúncio (cookies _fbp/_fbc/_ga/_ga_<id>, ?fbclid, ?gclid, utm_*)
// para a UI mandar em cartSchema.tracking junto com `consent`. NÃO existe dataLayer, pushCheckoutEvent nem pixel aqui:
// os eventos do checkout saem só do servidor (trackServerEvent). Nunca grava cookie nem chama rede.
import type { AdIds } from "./types";

export function readAdIds(): AdIds {
  // STUB: implementado por rastreamento (document.cookie + window.location.search; guardar em try/catch).
  return {};
}
