"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Tag, X } from "lucide-react";

export function CouponField({ coupon, applied, busy, onApply }: {
  coupon: string;
  applied: boolean;
  busy: boolean;
  onApply: (code: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(coupon);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = previous; };
  }, [open]);

  function showDialog() {
    setDraft(coupon);
    setError("");
    dialog.current?.showModal();
    setOpen(true);
    input.current?.focus();
  }

  async function submit(code: string) {
    if (busy || pending) return;
    setError("");
    setPending(true);
    try {
      const message = await onApply(code);
      if (message) setError(message);
      else {
        setDraft(code);
        dialog.current?.close();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ck-coupon">
      <button ref={trigger} type="button" className="ck-coupon-trigger" aria-haspopup="dialog" aria-controls="coupon-dialog" onClick={showDialog}>
        <Tag size={17} aria-hidden="true" /><span>{applied ? "Alterar cupom de desconto" : "Tem um cupom de desconto?"}</span><ChevronRight size={16} aria-hidden="true" />
      </button>
      {applied ? <div className="ck-coupon-applied">
        <span><Check size={16} aria-hidden="true" /><b>{coupon}</b></span>
        <button type="button" disabled={busy || pending} onClick={() => void submit("")}>{pending ? "Removendo…" : "Remover"}</button>
      </div> : null}
      <p className="ck-coupon-feedback" role="status">{applied ? "Cupom aplicado ao pagamento no Pix." : ""}</p>
      {!open && error ? <p className="ck-coupon-error" role="alert">{error}</p> : null}
      <dialog id="coupon-dialog" ref={dialog} className="ck-coupon-modal" aria-labelledby="coupon-title" aria-describedby="coupon-description"
        onClose={() => { setOpen(false); setError(""); trigger.current?.focus(); }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close();
        }}>
        <button className="ck-coupon-close" type="button" aria-label="Fechar cupom" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button>
        <span className="ck-coupon-modal-icon"><Tag size={23} aria-hidden="true" /></span>
        <h2 id="coupon-title">Seu desconto começa aqui</h2>
        <p id="coupon-description">Digite seu cupom para conferir o desconto no Pix.</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          const code = draft.trim().toUpperCase();
          if (!code) { setError("Digite o código do cupom."); input.current?.focus(); return; }
          void submit(code);
        }}>
          <label htmlFor="checkout-coupon">Cupom de desconto</label>
          <div className="ck-coupon-entry">
            <input ref={input} id="checkout-coupon" name="coupon" value={draft} onChange={(event) => { setDraft(event.target.value); setError(""); }}
              placeholder="Digite seu cupom" maxLength={40} autoCapitalize="characters" autoComplete="off" spellCheck={false}
              readOnly={busy || pending} aria-invalid={!!error} aria-describedby="coupon-feedback" />
            <button type="submit" disabled={busy || pending}>{pending ? "Aplicando…" : "Aplicar cupom"}</button>
          </div>
          <p id="coupon-feedback" className={error ? "ck-coupon-error" : "ck-coupon-help"} role="status">{error || "O total será atualizado após a validação."}</p>
        </form>
      </dialog>
    </div>
  );
}
