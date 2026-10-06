"use client";

import { Check, CircleAlert, Copy, LoaderCircle, RefreshCw, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getStatus, isApiFail } from "./api";
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
  const [statusMessage, setStatusMessage] = useState("");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [terminalStatus, setTerminalStatus] = useState<"refused" | "canceled" | null>(null);
  const checkStatusRef = useRef<(() => Promise<void>) | null>(null);
  const expiresMs = new Date(expiresAt).getTime();
  const expired = now !== null && now >= expiresMs;
  const refreshedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let checking = false;
    let manualRequested = false;
    const poll = async (manual = false) => {
      if ((!manual && document.hidden) || cancelled || refreshedRef.current) return;
      if (manual) {
        manualRequested = true;
        setCheckingStatus(true);
      }
      if (checking) return;
      checking = true;
      const result = await getStatus(publicToken);
      checking = false;
      if (cancelled) return;
      setCheckingStatus(false);
      if (isApiFail(result)) {
        setStatusMessage("Não foi possível consultar o pagamento. Verifique sua conexão e tente verificar novamente.");
        return;
      }
      // Só a aprovação garante que a página do servidor substituirá este componente.
      // A recusa pode ser da última tentativa com o pedido ainda pending: mantemos a consulta ativa.
      if (result.status === "paid") {
        refreshedRef.current = true;
        router.refresh();
        return;
      }
      setTerminalStatus(result.status === "pending" ? null : result.status);
      setStatusMessage(manualRequested && result.status === "pending" ? "O pagamento ainda não foi confirmado. Se você já pagou, aguarde: esta página atualiza automaticamente." : "");
      manualRequested = false;
    };
    checkStatusRef.current = () => poll(true);
    // A confirmação pode chegar depois do vencimento ou enquanto o app do banco está aberto.
    void poll();
    const checkWhenVisible = () => void poll();
    document.addEventListener("visibilitychange", checkWhenVisible);
    const id = window.setInterval(checkWhenVisible, expired ? 15_000 : 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      checkStatusRef.current = null;
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

  const verifyPayment = (
    <div className="pix-check-payment">
      <button type="button" className="pix-status-check" onClick={() => void checkStatusRef.current?.()} disabled={checkingStatus}>
        {checkingStatus ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <RefreshCw size={17} aria-hidden="true" />}
        {checkingStatus ? "Verificando pagamento…" : "Já paguei. Verificar pagamento"}
      </button>
      <p className="pix-status-feedback" role="status">{statusMessage}</p>
    </div>
  );

  if (terminalStatus) {
    return (
      <div className="ck-pix no-qr ck-pix-watch">
        <div className="ck-pix-info">
          <div className="ck-pix-expired">
            <strong>{terminalStatus === "canceled" ? "Este pagamento foi cancelado" : "Pagamento não aprovado"}</strong>
            <p>Se já pagou, confira a confirmação no app do banco. Para uma nova tentativa, use o link de compra ou fale com o atendimento.</p>
          </div>
          {verifyPayment}
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="ck-pix no-qr ck-pix-watch">
        <div className="ck-pix-info">
          <div className="ck-pix-expired">
            <strong>Código expirado</strong>
            <p>O código Pix deste pedido expirou. Fale com a gente para receber um novo link de pagamento.</p>
          </div>
          {verifyPayment}
        </div>
      </div>
    );
  }

  const left = now === null ? null : Math.max(0, Math.ceil((expiresMs - now) / 1000));

  return (
    <div className={`ck-pix ck-pix-watch${qrUrl ? " has-real-qr" : " no-qr"}`}>
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
        {verifyPayment}
      </div>
      {qrUrl ? <PixQr src={qrUrl} /> : null}
    </div>
  );
}
