"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { COLOR_LABELS, checkoutUrl, ownCheckoutPath } from "@/lib/site/constants";
import type { Pack } from "@/lib/site/types";
import { kitFocusTarget, revealFocus, useSelection } from "./SelectionProvider";

/** Rotulo do Comprar quando a escolha esta completa (e o botao pulsa). */
const READY_LABEL: Record<Pack, string> = { unit: "Quero 1 unidade", kit: "Quero o kit com 2" };

/**
 * Modo do checkout ("proprio" | "zedy"), plano 8.9. PurchaseLink é "use client" e Hero/Offers/page.tsx
 * (que o usam) não fazem parte do escopo deste agente para virar server component e repassar a
 * configuração por prop — por isso o modo é lido aqui mesmo, uma única vez por carregamento de página,
 * de GET /api/checkout/config (pública, já cacheia no client via este módulo). Enquanto não chega
 * resposta (ou se falhar) o link continua indo para a Zedy, o comportamento atual — sem regressão.
 */
let modeRequest: Promise<"proprio" | "zedy"> | null = null;

function getCheckoutMode(): Promise<"proprio" | "zedy"> {
  if (!modeRequest) {
    modeRequest = fetch("/api/checkout/config", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { mode?: string } | null) => (data?.mode === "proprio" ? "proprio" : "zedy"))
      .catch(() => "zedy" as const);
  }
  return modeRequest;
}

/** utm_*, fbclid e gclid da URL atual, para anexar ao link do checkout próprio (o Zedy já os lê sozinho). */
function adParamsFromLocation(): string {
  if (typeof window === "undefined") return "";
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return "";
  }
  const out = new URLSearchParams();
  params.forEach((value, key) => {
    const k = key.trim().toLowerCase();
    if (k === "fbclid" || k === "gclid" || /^utm_[a-z_]{1,30}$/.test(k)) out.set(key, value);
  });
  const qs = out.toString();
  return qs ? `&${qs}` : "";
}

/**
 * Comprar nunca trava (pedido do dono, 26/09): sempre tem link para o checkout. Com a escolha incompleta
 * (cor da unidade ou as duas cores do kit) o botao fica verde sem pulsar e o PRIMEIRO clique so avisa e
 * leva a cor que falta; o segundo segue com as cores que estao na tela. Escolha completa: pulsa e vira "Quero...".
 */
export function PurchaseLink({ pack, className, children }: { pack: Pack; className: string; children: ReactNode }) {
  const { color, colorTouched, kitColors, kitConfirmed, kitReady, reopenKitStep } = useSelection();
  const hintId = useId();
  const [warned, setWarned] = useState(false);
  const [mode, setMode] = useState<"proprio" | "zedy">("zedy");
  useEffect(() => {
    getCheckoutMode().then(setMode);
  }, []);
  const incomplete = pack === "kit" ? !kitReady : !colorTouched;
  const missing = kitConfirmed[0] ? 1 : 0;
  const fallback = pack === "kit" ? kitColors.map((c) => COLOR_LABELS[c]).join(" + ") : COLOR_LABELS[color];

  let hint: string;
  if (!incomplete) hint = pack === "kit" ? "Duas cores escolhidas. Seu kit está pronto!" : "Cor escolhida. É só comprar!";
  else if (warned) hint = `Escolha acima ou toque de novo para seguir com ${fallback}.`;
  else if (pack === "unit") hint = "Escolha a cor do seu AquaBlast e siga para o checkout.";
  else if (!kitConfirmed[0] && !kitConfirmed[1]) hint = "Escolha a cor do primeiro e do segundo brinquedo e siga.";
  else hint = `Falta escolher a cor do ${missing === 0 ? "primeiro" : "segundo"} brinquedo.`;

  /** Leva o foco a cor que falta (so rola se estiver fora da tela). No kit, fecha antes um "Trocar" aberto. */
  const focusMissingChoice = (link: HTMLAnchorElement) => {
    const container = link.closest(".price-card, .desktop-product-panel");
    if (pack !== "kit") {
      const first = container?.querySelector<HTMLButtonElement>("button[data-color]");
      if (first) revealFocus(first);
      return;
    }
    reopenKitStep(null);
    const target =
      kitFocusTarget(container) ??
      container?.querySelector<HTMLButtonElement>(`button[data-kit-index="${missing}"]`);
    if (target) revealFocus(target);
  };

  return (
    <>
      <a
        className={className}
        data-purchase={pack}
        data-incomplete={incomplete || undefined}
        href={mode === "proprio" ? `${ownCheckoutPath(pack, color, kitColors)}${adParamsFromLocation()}` : checkoutUrl(pack, color, kitColors)}
        aria-describedby={hintId}
        onClick={(event) => {
          if (!incomplete || warned) return;
          event.preventDefault();
          setWarned(true);
          focusMissingChoice(event.currentTarget);
        }}
      >
        {incomplete ? children : READY_LABEL[pack]}
      </a>
      <p id={hintId} className="kit-selection-hint" data-warned={(incomplete && warned) || undefined} role="status">
        {hint}
      </p>
    </>
  );
}
