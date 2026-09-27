"use client";

import Image from "next/image";
import { Check, CircleAlert, Copy, LoaderCircle, RefreshCw, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/checkout/own/masks";
import { getStatus, isApiFail, postPay, postSimulatePaid } from "./api";
import { DemoQr, PaySeals } from "./PaySeals";
import type { PixResult } from "./types";
import { pad2, ttlLabel, useClock } from "./useClock";

/**
 * Pix (origem app/simulated-payment.tsx, `PixPay`), mesmas classes e textos, agora com o servidor de verdade:
 * FINALIZAR COMPRA faz o POST /api/checkout/pay (`method:"pix"`), o código vem do gateway e o status é
 * consultado a cada 5 s em GET /api/checkout/status (pausado com a aba oculta) até expirar.
 *
 * QR (plano 8.6): gateway `simulado` → o QR de demonstração da origem (o código "SIMULADO-NAO-PAGUE-..." também
 * não é pagável); gateway real com `qrUrl` → a imagem do gateway (`unoptimized`, pode ser data: URI); gateway
 * real sem `qrUrl` → só o copia e cola (`.ck-pix.no-qr`), nunca um QR falso. "Simular pagamento aprovado" só
 * existe com o `simulado`. A validade ("vale por 10 minutos") sai de `checkout.pixTtlSeconds`.
 */
export function PixPay({
  cartToken,
  bump,
  amountCents,
  ttlSeconds,
  testMode,
  storeName,
  onPaid,
}: {
  cartToken: string;
  bump: boolean;
  amountCents: number;
  ttlSeconds: number;
  testMode: boolean;
  storeName: string;
  onPaid: (publicToken: string) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "loading" | "ready">("idle");
  const [pix, setPix] = useState<(PixResult & { publicToken: string; localExpiresMs: number }) | null>(null);
  const [error, setError] = useState("");
  const [copyMsg, setCopyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [simulating, setSimulating] = useState(false);
  const now = useClock(phase === "ready");
  const onPaidRef = useRef(onPaid);

  useEffect(() => {
    onPaidRef.current = onPaid;
  }, [onPaid]);

  const expiresMs = pix?.localExpiresMs ?? 0;
  // Antes do 1º tick do relógio mostra a validade cheia; depois, o que falta até a validade (no relógio deste aparelho).
  const left = now === null ? ttlSeconds : Math.max(0, Math.ceil((expiresMs - now) / 1000));
  const expired = phase === "ready" && left === 0;
  const publicToken = pix?.publicToken ?? "";

  useEffect(() => {
    if (phase !== "ready" || expired || !publicToken) return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden || cancelled) return;
      const result = await getStatus(publicToken);
      if (!cancelled && result.ok && result.status === "paid") onPaidRef.current(publicToken);
    };
    const id = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phase, expired, publicToken]);

  async function generate() {
    setPhase("loading");
    setCopyMsg(null);
    setError("");
    const result = await postPay({ cartToken, method: "pix", installments: 1, bump });
    if (isApiFail(result)) {
      setError(result.message ?? result.error);
      setPhase(pix ? "ready" : "idle");
      return;
    }
    if (result.status === "paid") {
      onPaidRef.current(result.publicToken);
      return;
    }
    if (result.status === "pending" && result.pix) {
      // Relógio do aparelho errado (adiantado/atrasado) faria o código nascer "expirado" ou durar horas: se o
      // `expiresAt` do servidor não cabe na validade configurada, conta a validade a partir de agora (fase 14.3).
      const nowMs = Date.now();
      const remain = new Date(result.pix.expiresAt).getTime() - nowMs;
      const localExpiresMs = nowMs + (remain > 0 && remain <= ttlSeconds * 1000 + 5000 ? remain : ttlSeconds * 1000);
      setPix({ ...result.pix, publicToken: result.publicToken, localExpiresMs });
      setPhase("ready");
      return;
    }
    setError(result.message ?? "Não foi possível gerar o Pix. Tente de novo.");
    setPhase("idle");
  }

  async function copy() {
    try {
      if (!navigator.clipboard || !pix) throw new Error("sem clipboard");
      await navigator.clipboard.writeText(pix.code);
      setCopyMsg({ ok: true, text: "Código copiado" });
    } catch {
      setCopyMsg({ ok: false, text: "Não foi possível copiar. Selecione o código acima e copie manualmente." });
    }
  }

  async function simulatePaid() {
    if (!publicToken) return;
    setSimulating(true);
    setError("");
    const result = await postSimulatePaid(publicToken);
    setSimulating(false);
    if (isApiFail(result)) {
      setError(result.error);
      return;
    }
    if (result.status === "paid") onPaidRef.current(publicToken);
  }

  const ttl = ttlLabel(ttlSeconds);
  const errorBox = error ? (
    <p className="error" role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      {error}
    </p>
  ) : null;

  if (phase !== "ready" || !pix) {
    return (
      <div className="ck-pix-start">
        <p>A forma mais rápida e segura de finalizar sua compra e garantir seu pedido.</p>
        <p className="ck-pix-value">
          Valor no Pix: <b>{money(amountCents)}</b>
        </p>
        <p className="ck-pix-note">
          <Timer size={15} aria-hidden="true" />O código Pix é gerado na hora e vale por {ttl}.
        </p>
        {errorBox}
        <button type="button" className="primary-button ck-pay-btn" onClick={() => void generate()} disabled={phase === "loading"}>
          {phase === "loading" ? (
            <>
              <LoaderCircle className="spin" size={19} aria-hidden="true" />
              Gerando Pix…
            </>
          ) : (
            "FINALIZAR COMPRA"
          )}
        </button>
        <PaySeals storeName={storeName} />
      </div>
    );
  }

  const qr = testMode ? (
    <DemoQr seed={pix.code} dim={expired} />
  ) : pix.qrUrl ? (
    <figure className={`ck-qr${expired ? " is-dim" : ""}`}>
      <Image src={pix.qrUrl} alt="QR Code Pix" width={196} height={196} unoptimized />
    </figure>
  ) : null;

  return (
    <div className={`ck-pix${qr ? "" : " no-qr"}`}>
      {qr}
      <div className="ck-pix-info">
        {expired ? (
          <div className="ck-pix-expired">
            <strong>Código expirado</strong>
            <p>O prazo de {ttl} acabou. Gere um novo código para continuar.</p>
            {errorBox}
            <button type="button" className="primary-button ck-pay-btn" onClick={() => void generate()}>
              <RefreshCw size={18} aria-hidden="true" />
              Gerar novo Pix
            </button>
          </div>
        ) : (
          <>
            <div className="ck-pix-head">
              <p>
                Valor: <strong>{money(amountCents)}</strong>
              </p>
              <p className="ck-pix-timer" aria-live="off">
                <Timer size={16} aria-hidden="true" />
                Expira em{" "}
                <b>
                  {pad2(Math.floor(left / 60))}:{pad2(left % 60)}
                </b>
              </p>
            </div>
            <div className="ck-copy-row">
              <label className="field">
                <span>Pix copia e cola</span>
                <input name="pix-code" readOnly value={pix.code} onFocus={(e) => e.currentTarget.select()} />
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
              <li>{qr ? "Escaneie ou cole o código" : "Cole o código"}</li>
            </ol>
            {errorBox}
            {testMode ? (
              <button type="button" className="primary-button ck-pay-btn" onClick={() => void simulatePaid()} disabled={simulating}>
                <Check size={19} aria-hidden="true" />
                Simular pagamento aprovado
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
