"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getStatus } from "./api";

/**
 * QR/código Pix real + polling de status (plano 8.7). `qrUrl` pode ser uma URL normal ou uma
 * `data:` URI (depende do gateway) — por isso `unoptimized` no `next/image`, igual origem.
 * Poll a cada 5s em `GET /api/checkout/status/<publicToken>`, pausado quando a aba está oculta
 * (`document.hidden`), até `expiresAt`. "Gerar novo código" chama `onRegenerate` (novo POST /pay
 * feito por quem chama, StepPagamento/CardPay-sibling) e substitui os dados do Pix aqui.
 */
export function PixPay({
  code,
  qrUrl,
  expiresAt,
  publicToken,
  onRegenerate,
  onPaid,
  regenerating,
}: {
  code: string;
  qrUrl: string | null;
  expiresAt: string;
  publicToken: string;
  onRegenerate: () => void;
  onPaid: () => void;
  regenerating: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const expiresMs = new Date(expiresAt).getTime();
  const expired = now >= expiresMs;
  const onPaidRef = useRef(onPaid);

  useEffect(() => {
    // Atualiza a ref em efeito, não durante o render (regra react-hooks/refs).
    onPaidRef.current = onPaid;
  }, [onPaid]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (expired) return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden || cancelled) return;
      const result = await getStatus(publicToken);
      if (!cancelled && result.ok && result.status === "paid") onPaidRef.current();
    };
    const id = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [publicToken, expired]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // ambiente sem clipboard (ex.: http local): sem feedback, o código já está selecionável.
    }
  };

  const secondsLeft = Math.max(0, Math.floor((expiresMs - now) / 1000));
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  if (expired) {
    return (
      <div className="ck-pix-expired">
        <p>O código Pix expirou. Gere um novo código para continuar.</p>
        <button type="button" className={`primary-button${regenerating ? " spin" : ""}`} onClick={onRegenerate} disabled={regenerating}>
          Gerar novo código
        </button>
      </div>
    );
  }

  return (
    <div className="ck-pix">
      <div className="ck-qr">
        {qrUrl ? <Image src={qrUrl} alt="QR Code Pix" width={220} height={220} unoptimized /> : null}
      </div>
      <div className="ck-pix-info">
        <div className="ck-pix-head">
          <span>Pague com Pix</span>
          <span className="ck-pix-timer">Expira em {mm}:{ss}</span>
        </div>
        <div className="ck-copy-row">
          <input value={code} readOnly aria-label="Código Pix copia e cola" />
          <button type="button" className="ck-copy" onClick={copy}>
            {copied ? "Copiado!" : "Copiar código"}
          </button>
        </div>
        {copied ? <p className="ck-copied">Código copiado.</p> : null}
        <ol className="ck-pix-steps">
          <li>Abra o app do seu banco</li>
          <li>Escolha pagar via Pix com QR Code ou copia e cola</li>
          <li>Confirme o pagamento — a confirmação aparece aqui automaticamente</li>
        </ol>
      </div>
    </div>
  );
}
