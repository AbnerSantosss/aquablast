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
 * resposta (HTML do servidor, antes da hidratação, ou fetch que falhou) o link vai para /checkout, que no
 * servidor redireciona para a Zedy quando o painel está em "zedy". Antes (até 2026-09-28) o link nascia na
 * Zedy e quem clicava rápido caía no checkout antigo mesmo com o modo "proprio" ligado.
 */
let modeRequest: Promise<"proprio" | "zedy" | null> | null = null;

function getCheckoutMode(): Promise<"proprio" | "zedy" | null> {
  if (!modeRequest) {
    modeRequest = fetch("/api/checkout/config", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { mode?: string } | null) => (data?.mode === "proprio" ? "proprio" : data?.mode === "zedy" ? "zedy" : null))
      .catch(() => null);
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
 * Registra o clique no Comprar (POST /api/track/click → painel /admin/cliques, pedido do dono em 2026-10-02).
 * `keepalive`: o pedido sobrevive à troca de página para o checkout. Nunca bloqueia nem atrasa o link.
 */
function trackBuyClick(link: HTMLElement, click: { pack: Pack; colors: string[]; complete: boolean; warned: boolean }) {
  try {
    let utm: string | undefined;
    try {
      utm = new URLSearchParams(window.location.search).get("utm_source")?.slice(0, 80) || undefined;
    } catch {
      utm = undefined;
    }
    const body = JSON.stringify({
      ...click,
      id: `bc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
      place: link.closest(".desktop-product-panel, .mobile-top-buy") ? "topo" : "ofertas",
      device: window.matchMedia("(max-width: 900px)").matches ? "mobile" : "desktop",
      utm,
    });
    fetch("/api/track/click", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => undefined);
  } catch {
    // rastreio nunca atrapalha a compra
  }
}

/**
 * As ofertas exigem a escolha das cores antes do checkout.
 * A unidade abre o guia do topo e o kit abre o guia do próprio card.
 *
 * `direct` (compra direta do primeiro bloco do celular, pedido do dono 04/10): o primeiro toque ja vai para o
 * checkout com a cor ja escolhida, sem aviso nem dica. Desde 2026-10-10 tambem serve ao guia da unidade sem cor
 * escolhida: o guia avisa uma vez e o link segue com a cor padrao (o Comprar nunca trava).
 */
export function PurchaseLink({
  pack,
  className,
  children,
  direct = false,
}: {
  pack: Pack;
  className: string;
  children: ReactNode;
  direct?: boolean;
}) {
  const { color, colorTouched, kitColors, kitConfirmed, kitReady, reopenKitStep } = useSelection();
  const hintId = useId();
  const [warned, setWarned] = useState(false);
  const [mode, setMode] = useState<"proprio" | "zedy" | null>(null);
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

  // utm/fbclid/gclid vao sempre que o destino e /checkout, inclusive enquanto o modo ainda nao chegou (clique
  // rapido antes do fetch de config). Ate 2026-10-09 so iam com mode === "proprio": quem clicava antes da
  // resposta chegava ao checkout sem atribuicao e o Purchase saia sem utm. Se o modo for "zedy", /checkout
  // redireciona no servidor e os parametros extras sao ignorados, sem prejuizo.
  const href =
    mode === "zedy"
      ? checkoutUrl(pack, color, kitColors)
      : `${ownCheckoutPath(pack, color, kitColors)}${adParamsFromLocation()}`;

  // `direct` dentro do guia da unidade: o guia ja avisou, o link segue com a cor padrao em vez de reabrir o dialogo.
  if (pack === "unit" && incomplete && !direct) {
    return (
      <button
        type="button"
        className={className}
        data-purchase="unit"
        data-incomplete
        aria-haspopup="dialog"
        onClick={(event) => {
          trackBuyClick(event.currentTarget, { pack, colors: [color], complete: false, warned: true });
          document.getElementById("hero-unit-guide-trigger")?.click();
        }}
      >
        {children}
      </button>
    );
  }

  if (pack === "kit" && incomplete) {
    return <button type="button" className={className} data-purchase="kit" data-incomplete aria-haspopup="dialog" onClick={(event) => {
      trackBuyClick(event.currentTarget, { pack, colors: [...kitColors], complete: false, warned: true });
      const card = event.currentTarget.closest(".price-card");
      const nextChoice = card?.querySelector<HTMLButtonElement>("[data-kit-guide] button[data-current]") ?? card?.querySelector<HTMLButtonElement>("[data-kit-guide] button:not(:disabled)");
      nextChoice?.click();
    }}>{children}</button>;
  }

  if (direct) {
    return (
      <a
        className={className}
        data-purchase={pack}
        href={href}
        onClick={(event) => {
          trackBuyClick(event.currentTarget, { pack, colors: pack === "kit" ? [...kitColors] : [color], complete: !incomplete, warned: false });
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <>
      <a
        className={className}
        data-purchase={pack}
        data-incomplete={incomplete || undefined}
        href={href}
        aria-describedby={hintId}
        onClick={(event) => {
          const onlyWarn = incomplete && !warned;
          trackBuyClick(event.currentTarget, { pack, colors: pack === "kit" ? [...kitColors] : [color], complete: !incomplete, warned: onlyWarn });
          if (!onlyWarn) return;
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
