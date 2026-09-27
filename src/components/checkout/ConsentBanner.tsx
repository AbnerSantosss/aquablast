"use client";

import { useEffect, useState } from "react";

/**
 * Banner de consentimento (LGPD, plano 9.2). Só existe no checkout — não toca no layout do site
 * (`src/app/(site)/layout.tsx`). Decide se a tela pode ler/mandar os identificadores de anúncio
 * (`readAdIds()`, @/lib/tracking-ads/capture) dentro de `cartSchema.tracking`; sem resposta salva ainda,
 * `consent` fica indefinido e o Checkout trata como "sem consentimento" (a não ser que
 * `ads.consentRequired` esteja desligado no painel — nesse caso a tela nem mostra este banner).
 * Guardado só neste navegador (localStorage, try/catch): não é dado pessoal, é a escolha da pessoa.
 */
const STORAGE_KEY = "ck-consent";

export type ConsentValue = "accepted" | "declined";

function readStored(): ConsentValue | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "accepted" || v === "declined" ? v : null;
  } catch {
    return null;
  }
}

function writeStored(value: ConsentValue): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage indisponível (navegador privado, bloqueio de site): segue sem persistir.
  }
}

export function ConsentBanner({ requireConsent, onDecide }: { requireConsent: boolean; onDecide: (accepted: boolean) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!requireConsent) {
      onDecide(true);
      return;
    }
    const stored = readStored();
    if (stored) onDecide(stored === "accepted");
    else setVisible(true);
    // Só na primeira renderização: onDecide muda de identidade a cada render do pai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requireConsent]);

  if (!visible) return null;

  const decide = (value: ConsentValue) => {
    writeStored(value);
    setVisible(false);
    onDecide(value === "accepted");
  };

  return (
    <div className="ck-consent" role="dialog" aria-label="Consentimento de cookies">
      <p>
        Usamos cookies e identificadores de anúncio para medir o resultado das nossas campanhas. Você pode aceitar ou
        seguir sem eles — isso não muda o preço nem a entrega do seu pedido.
      </p>
      <div className="ck-consent-actions">
        <button type="button" className="ck-consent-decline" onClick={() => decide("declined")}>
          Só o essencial
        </button>
        <button type="button" className="ck-consent-accept" onClick={() => decide("accepted")}>
          Aceitar
        </button>
      </div>
    </div>
  );
}
