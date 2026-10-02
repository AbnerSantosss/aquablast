"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Popup do erro que trava o cliente (pedido do dono, 2026-10-02): título curto, o problema exato e um botão que
 * fecha e leva o cursor ao campo. Fecha também com Esc ou tocando fora. O mesmo texto fica na caixa de erro da
 * etapa, para quem fechar o popup sem ler.
 */
export function ErrorDialog({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="ck-alert-backdrop" onClick={() => close.current()}>
      <div className="ck-alert" role="alertdialog" aria-modal="true" aria-labelledby="ck-alert-title" aria-describedby="ck-alert-msg" onClick={(e) => e.stopPropagation()}>
        <span className="ck-alert-icon" aria-hidden="true">
          <CircleAlert size={30} strokeWidth={2.4} />
        </span>
        <h2 id="ck-alert-title">{title}</h2>
        <p id="ck-alert-msg">{message}</p>
        <button ref={button} type="button" className="primary-button" onClick={() => close.current()}>
          CORRIGIR AGORA
        </button>
      </div>
    </div>
  );
}
