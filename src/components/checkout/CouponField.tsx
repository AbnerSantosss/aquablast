"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Tag } from "lucide-react";
import styles from "./CouponField.module.css";

const COUPON_PANEL_ID = "checkout-coupon-panel";

/**
 * Cupom recolhido (2026-10-11): só o botão "Tenho um cupom" aparece; o clique abre o campo e leva o foco para ele.
 * Já nasce aberto quando há cupom aplicado ou vindo da URL (`coupon` não vazio). O erro só é criado com o campo
 * aberto e o campo só fecha por clique do cliente, então erro de cupom nunca fica escondido.
 */
export function CouponField({ coupon, applied, busy, onApply }: {
  coupon: string;
  applied: boolean;
  busy: boolean;
  onApply: (code: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(coupon);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(applied || coupon !== "");
  const input = useRef<HTMLInputElement>(null);
  const focusOnOpen = useRef(false);

  // O campo só existe para o foco depois que o painel deixa de estar `hidden`.
  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    input.current?.focus();
  }, [open]);

  async function submit(code: string) {
    if (busy || pending) return;
    setError("");
    setPending(true);
    try {
      const message = await onApply(code);
      if (message) setError(message);
      else setDraft(code);
    } catch {
      setError("Não foi possível validar o cupom. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  function toggle() {
    focusOnOpen.current = !open;
    if (open) setError("");
    setOpen(!open);
  }

  return (
    <div className={styles.coupon} data-summary-coupon data-open={open}>
      <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={COUPON_PANEL_ID} onClick={toggle}>
        <Tag size={16} aria-hidden="true" />
        <span>Tenho um cupom</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div className={styles.panel} id={COUPON_PANEL_ID} hidden={!open}>
        <form aria-label="Cupom de desconto" onSubmit={(event) => {
          event.preventDefault();
          const code = draft.trim().toUpperCase();
          if (!code) { setError("Digite o código do cupom."); input.current?.focus(); return; }
          void submit(code);
        }}>
          <div className={styles.entry}>
            <input ref={input} id="checkout-coupon" name="coupon" value={draft} onChange={(event) => { setDraft(event.target.value); setError(""); }}
              placeholder="Digite seu cupom" maxLength={40} autoCapitalize="characters" autoComplete="off" spellCheck={false}
              readOnly={busy || pending} aria-label="Cupom de desconto" aria-invalid={!!error} aria-describedby="coupon-feedback" />
            <button type="submit" disabled={busy || pending}>{pending ? "Aguarde…" : "Adicionar"}</button>
          </div>
        </form>
        {applied ? <div className={styles.applied}>
          <span><Check size={15} aria-hidden="true" /><b>{coupon}</b></span>
          <button type="button" disabled={busy || pending} onClick={() => void submit("")}>Remover cupom</button>
        </div> : null}
        <p id="coupon-feedback" className={error ? styles.error : styles.feedback} role={error ? "alert" : "status"}>
          {error || (applied ? "Cupom aplicado ao pagamento no Pix." : "")}
        </p>
      </div>
    </div>
  );
}
