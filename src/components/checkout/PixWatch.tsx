"use client";

import { Check, CircleAlert, Copy, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getStatus } from "./api";
import { PixQr } from "./PixQr";
import { pad2, useClock } from "./useClock";

/**
 * Pix pendente na página durável /checkout/pedido/[token] (plano 8.8), com as mesmas classes do `PixPay`
 * (origem app/simulated-payment.tsx): `.ck-pix`, `.ck-pix-head`, `.ck-copy-row` com `label.field`, `.ck-pix-steps`.
 * Só leitura: aqui não existe `cartToken` (a página lê o pedido direto do banco), então não dá para gerar um
 * código novo se este expirar. Consulta o status a cada 5 s (pausado com a aba oculta); ao detectar `paid` chama
 * `router.refresh()` para o Server Component reler o pedido e mostrar a confirmação.
 */
export function PixWatch({ code, qrUrl, expiresAt, publicToken }: { code: string; qrUrl: string | null; expiresAt: string; publicToken: string }) {
  const router = useRouter();
  const now = useClock();
  const [copyMsg, setCopyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const expiresMs = new Date(expiresAt).getTime();
  const expired = now !== null && now >= expiresMs;
  const refreshedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let checking = false;
    const poll = async () => {
      if (document.hidden || cancelled || checking || refreshedRef.current) return;
      checking = true;
      const result = await getStatus(publicToken);
      checking = false;
      if (!cancelled && result.ok && result.status === "paid") {
        refreshedRef.current = true;
        router.refresh();
      }
    };
    // A confirmação pode chegar depois do vencimento ou enquanto o app do banco está aberto.
    void poll();
    document.addEventListener("visibilitychange", poll);
    const id = window.setInterval(poll, expired ? 15_000 : 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [publicToken, expired, router]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyMsg({ ok: true, text: "Código copiado." });
    } catch {
      setCopyMsg({ ok: false, text: "Não foi possível copiar. Selecione o código e copie manualmente." });
    }
  };

  if (expired) {
    return (
      <div className="ck-pix no-qr">
        <div className="ck-pix-info">
          <div className="ck-pix-expired">
            <strong>Código expirado</strong>
            <p>O código Pix deste pedido expirou. Fale com a gente para receber um novo link de pagamento.</p>
          </div>
        </div>
      </div>
    );
  }

  const left = now === null ? null : Math.max(0, Math.ceil((expiresMs - now) / 1000));

  return (
    <div className={`ck-pix${qrUrl ? " has-real-qr" : " no-qr"}`}>
      {qrUrl ? <PixQr src={qrUrl} /> : null}
      <div className="ck-pix-info">
        <div className="ck-pix-head">
          <p>Pague com Pix</p>
          {left !== null ? (
            <p className="ck-pix-timer" aria-live="off">
              <Timer size={16} aria-hidden="true" />
              Expira em{" "}
              <b>
                {pad2(Math.floor(left / 60))}:{pad2(left % 60)}
              </b>
            </p>
          ) : null}
        </div>
        <div className="ck-copy-row">
          <label className="field">
            <span>Pix copia e cola</span>
            <input name="pix-code" readOnly value={code} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <button type="button" className="ck-copy" onClick={() => void copy()}>
            <Copy size={17} aria-hidden="true" />
            Copiar código
          </button>
        </div>
        {copyMsg ? (
          <p role="status" className={copyMsg.ok ? "ck-copied" : "error"}>
            {copyMsg.ok ? <Check size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
            {copyMsg.text}
          </p>
        ) : null}
        <ol className="ck-pix-steps">
          <li>Abra o app do banco</li>
          <li>Escolha Pix</li>
          <li>{qrUrl ? "Escaneie ou cole o código" : "Cole o código"}</li>
        </ol>
      </div>
    </div>
  );
}
