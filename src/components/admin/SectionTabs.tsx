"use client";

import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";

export type SectionTab = { id: string; label: string; content: ReactNode };

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readHash = () => window.location.hash.slice(1);
const serverHash = () => "";

/**
 * Abas de seção das telas longas do painel (Configurações, Gateways): uma seção por vez, para a tela caber
 * na altura do computador. Os painéis ficam montados e só escondidos, então o que foi digitado numa aba não
 * se perde ao trocar de aba. A aba aberta vai para a URL (#id): recarregar ou colar o link abre a mesma.
 */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const uid = useId();
  const hash = useSyncExternalStore(subscribe, readHash, serverHash);
  // Clique guarda a aba e o hash daquele momento; se o hash mudar depois (link #secao), o hash vence.
  const [picked, setPicked] = useState<{ id: string; hash: string } | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const fromHash = tabs.some((t) => t.id === hash) ? hash : null;
  const active = picked && picked.hash === hash ? picked.id : (fromHash ?? tabs[0]?.id);

  function open(id: string) {
    window.history.replaceState(null, "", `#${id}`);
    setPicked({ id, hash: id });
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (index === last ? 0 : index + 1) : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    open(tabs[next].id);
    buttons.current[next]?.focus();
  }

  return (
    <div className="section-tabs">
      <div className="tabs" role="tablist" aria-label={label}>
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-controls={`${uid}-panel-${t.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={selected ? "is-active" : ""}
              onClick={() => open(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${uid}-panel-${t.id}`} aria-labelledby={`${uid}-tab-${t.id}`} className="tab-panel" hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
