"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getStatus } from "./api";

/**
 * Pix pendente na página durável /checkout/pedido/[token] (plano 8.8) — só leitura: aqui não existe
 * `cartToken` (a página lê o pedido direto do banco, `getOrderByPublicToken`), então não dá para gerar um
 * código novo se este expirar. Poll igual `PixPay.tsx` (a cada 5s, pausado com a aba oculta); ao detectar
 * `status:"paid"` chama `router.refresh()` para o Server Component reler o pedido do banco e trocar esta
 * tela pela confirmação — não duplica o HTML de sucesso aqui.
 */
export function PixWatch({ code, qrUrl, expiresAt, publicToken }: { code: string; qrUrl: string | null; expiresAt: string; publicToken: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const expiresMs = new Date(expiresAt).getTime();
  const expired = now >= expiresMs;
  const refreshedRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (expired) return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden || cancelled || refreshedRef.current) return;
      const result = await getStatus(publicToken);
      if (!cancelled && result.ok && result.status === "paid") {
        refreshedRef.current = true;
        router.refresh();
      }
    };
    const id = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [publicToken, expired, router]);

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
      // ambiente sem clipboard: código já está selecionável no campo abaixo.
    }
  };

  if (expired) {
    return (
      <div className="ck-pix-expired">
        <p>O código Pix deste pedido expirou. Fale com a gente para receber um novo link de pagamento.</p>
      </div>
    );
  }

  const secondsLeft = Math.max(0, Math.floor((expiresMs - now) / 1000));
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="ck-pix">
      <div className="ck-qr">{qrUrl ? <Image src={qrUrl} alt="QR Code Pix" width={220} height={220} unoptimized /> : null}</div>
      <div className="ck-pix-info">
        <div className="ck-pix-head">
          <span>Pague com Pix</span>
          <span className="ck-pix-timer">
            Expira em {mm}:{ss}
          </span>
        </div>
        <div className="ck-copy-row">
          <input value={code} readOnly aria-label="Código Pix copia e cola" />
          <button type="button" className="ck-copy" onClick={() => void copy()}>
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
