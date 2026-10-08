"use client";

import Image from "next/image";
import { Check, Copy, Timer } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { money } from "@/lib/checkout/own/masks";
import { DemoQr } from "./PaySeals";
import { pad2 } from "./useClock";
import styles from "./PixPaymentCode.module.css";

/** The actionable Pix area is shared by a new payment and a recovered order. */
export function PixPaymentCode({ code, qrUrl, seconds, amountCents, testMode = false, storeName = "AquaBlast", children }: {
  code: string;
  qrUrl?: string | null;
  seconds: number | null;
  amountCents?: number;
  testMode?: boolean;
  storeName?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const hasQr = testMode || (qrUrl && !qrFailed);

  useEffect(() => {
    // Generated payment replaces a much taller form. Reveal the QR and copy action once,
    // never again on a timer tick, status poll or when returning from the bank app.
    const frame = requestAnimationFrame(() => {
      panel.current?.scrollIntoView({ block: "start", behavior: "instant" });
      panel.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
      setCopied(false);
    }
  }

  return <div ref={panel} tabIndex={-1} className={styles.panel} data-pix-payment-code aria-labelledby={`${id}-title`}>
    <div className={styles.essential} data-pix-essential>
      <header className={styles.header}>
        <h4 id={`${id}-title`}>Pague com Pix</h4>
        {amountCents !== undefined && <strong className={styles.amount}>{money(amountCents)}</strong>}
        <p>{testMode ? "Demonstração — não efetue pagamento" : `Sua compra em ${storeName}`}</p>
      </header>
      {hasQr ? <div className={styles.qr} data-pix-qr>
        {testMode ? <DemoQr seed={code} /> : <Image src={qrUrl!} alt="QR Code para pagar com Pix" width={224} height={224} unoptimized onError={() => setQrFailed(true)} />}
      </div> : <p className={styles.qrFallback}>Use o código Pix Copia e Cola abaixo.</p>}
      <div className={styles.actions}>
        <button className={styles.copy} type="button" onClick={() => void copy()} data-pix-copy>
          {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
          {copied ? "Código copiado" : "Copiar código Pix"}
        </button>
        <p className={styles.feedback} role="status">{failed ? "Não foi possível copiar. Abra o código abaixo e copie manualmente." : copied ? "Agora cole no Pix Copia e Cola do seu banco." : "Escaneie o QR Code ou copie e cole no app do banco."}</p>
        <div className={styles.status}>
          <span>Aguardando pagamento</span>
          {seconds !== null && <span aria-live="off"><Timer size={14} aria-hidden="true" />Expira em <b data-pix-countdown>{pad2(Math.floor(seconds / 60))}:{pad2(seconds % 60)}</b></span>}
        </div>
      </div>
    </div>
    <details className={styles.help} open={failed || undefined}>
      <summary>Ver código Pix e instruções</summary>
      <label htmlFor={`${id}-code`}>Pix Copia e Cola</label>
      <input id={`${id}-code`} name="pix-code" readOnly value={code} onFocus={(event) => event.currentTarget.select()} spellCheck={false} />
      <ol><li>Abra o aplicativo do banco e escolha Pix.</li><li>Escaneie o QR Code ou cole o código copiado.</li><li>Confira o valor e os dados antes de confirmar.</li></ol>
      <p>Depois de pagar, volte a esta tela. A confirmação aparece automaticamente.</p>
    </details>
    {children}
  </div>;
}
