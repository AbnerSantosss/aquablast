"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import styles from "./CouponField.module.css";

export function CouponField({ coupon, applied, busy, onApply }: {
  coupon: string;
  applied: boolean;
  busy: boolean;
  onApply: (code: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(coupon);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);

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

  return (
    <div className={styles.coupon} data-summary-coupon>
      <form aria-label="Cupom de desconto" onSubmit={(event) => {
        event.preventDefault();
        const code = draft.trim().toUpperCase();
        if (!code) { setError("Digite o código do cupom."); input.current?.focus(); return; }
        void submit(code);
      }}>
        <label htmlFor="checkout-coupon">Tem um cupom?</label>
        <div className={styles.entry}>
          <input ref={input} id="checkout-coupon" name="coupon" value={draft} onChange={(event) => { setDraft(event.target.value); setError(""); }}
            placeholder="Digite seu cupom" maxLength={40} autoCapitalize="characters" autoComplete="off" spellCheck={false}
            readOnly={busy || pending} aria-invalid={!!error} aria-describedby="coupon-feedback" />
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
  );
}
