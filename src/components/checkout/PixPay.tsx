"use client";

import Image from "next/image";
import { Check, CircleAlert, Copy, LoaderCircle, RefreshCw, Timer, Smartphone, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/checkout/own/masks";
import { getStatus, isApiFail, postPay, postSimulatePaid } from "./api";
import { DemoQr } from "./PaySeals";
import type { PixResult } from "./types";
import { pad2, ttlLabel, useClock } from "./useClock";

/**
 * Gera o Pix e consulta a confirmação a cada 5 s (15 s após o vencimento).
 * QR Code visível por padrão, acompanhado do código copia e cola.
 * No gateway simulado, código e imagem são apenas demonstrações não pagáveis.
 */
export function PixPay({
  cartToken,
  bump,
  bumpColor = null,
  blocked = false,
  onBlocked,
  coupon,
  amountCents,
  ttlSeconds,
  testMode,
  storeName,
  onPaid,
}: {
  cartToken: string;
  bump: boolean;
  /** Cor da 2ª unidade; vai junto no POST quando há bump. */
  bumpColor?: string | null;
  /** Falta escolher a cor da 2ª unidade: o botão não cobra. */
  blocked?: boolean;
  onBlocked?: () => void;
  coupon: string;
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
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "refused" | "canceled">("pending");
  const [statusMessage, setStatusMessage] = useState("");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const checkStatusRef = useRef<(() => Promise<void>) | null>(null);
  const paidReportedRef = useRef(false);
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
    if (phase !== "ready" || !publicToken) return;
    let cancelled = false;
    let checking = false;
    let manualRequested = false;
    const poll = async (manual = false) => {
      if ((!manual && document.hidden) || cancelled || paidReportedRef.current) return;
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
      if (result.status === "paid") {
        paidReportedRef.current = true;
        onPaidRef.current(publicToken);
        return;
      }
      setPaymentStatus(result.status);
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
  }, [phase, expired, publicToken]);

  async function generate() {
    if (phase === "loading") return;
    if (blocked) {
      onBlocked?.();
      return;
    }
    setPhase("loading");
    setCopyMsg(null);
    setError("");
    setStatusMessage("");
    paidReportedRef.current = false;
    const result = await postPay({ cartToken, method: "pix", installments: 1, bump, ...(bump && bumpColor ? { bumpColor } : {}), ...(coupon ? { coupon } : {}) });
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
      setPaymentStatus("pending");
      setPhase("ready");
      return;
    }
    setError(result.message ?? "Não foi possível gerar o Pix. Tente de novo.");
    setPhase("idle");
  }

  async function copy() {
    try {
      if (expired || !navigator.clipboard || !pix) throw new Error("sem clipboard");
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

  const amount = (
    <div className="pix-payment-total">
      <span>Total a pagar no Pix</span>
      <strong>{money(amountCents)}</strong>
      <small>Compra em {storeName} · pagamento à vista</small>
    </div>
  );
  const instructions = (
    <ol className="pix-instructions">
      <li><span>1</span><p>Copie o código Pix.</p></li>
      <li><span>2</span><p>No app do banco, escolha <b>Pix Copia e Cola</b>.</p></li>
      <li><span>3</span><p>Confira os dados e confirme o pagamento.</p></li>
    </ol>
  );

  const verifyPayment = (
    <div className="pix-check-payment">
      <button type="button" className="pix-status-check" onClick={() => void checkStatusRef.current?.()} disabled={checkingStatus}>
        {checkingStatus ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <RefreshCw size={17} aria-hidden="true" />}
        {checkingStatus ? "Verificando pagamento…" : "Já paguei. Verificar pagamento"}
      </button>
      <p className="pix-status-feedback" role="status">{statusMessage}</p>
    </div>
  );

  if (phase !== "ready" || !pix) {
    return (
      <div className="pix-payment pix-payment-start" aria-busy={phase === "loading"}>
        {amount}
        <div className="pix-bank-guide">
          <Smartphone size={23} aria-hidden="true" />
          <div><strong>Pague pelo aplicativo do seu banco</strong><p>Gere o código, copie e cole no app. A confirmação aparece aqui após o pagamento.</p></div>
        </div>
        {errorBox}
        <button type="button" className="pix-primary" onClick={() => void generate()} disabled={phase === "loading"} aria-disabled={blocked || undefined}>
          {phase === "loading" ? <><LoaderCircle className="spin" size={18} aria-hidden="true" />Gerando código…</> : <>Gerar Pix de {money(amountCents)}<ArrowRight size={18} aria-hidden="true" /></>}
        </button>
        <p className="pix-footnote"><Timer size={15} aria-hidden="true" />Válido por {ttl} após a geração.</p>
      </div>
    );
  }

  if (paymentStatus !== "pending") {
    return (
      <div className="pix-payment pix-payment-expired">
        <span className="pix-expired-icon"><CircleAlert size={26} aria-hidden="true" /></span>
        <h4>{paymentStatus === "canceled" ? "Este código foi cancelado" : "Pagamento não aprovado"}</h4>
        <p>Você pode gerar outro código para pagar <b>{money(amountCents)}</b>. Se já pagou, confira o pagamento no app do banco antes de gerar um novo.</p>
        {errorBox}
        <button type="button" className="pix-primary" onClick={() => void generate()}><RefreshCw size={18} aria-hidden="true" />Gerar novo Pix de {money(amountCents)}</button>
        {verifyPayment}
      </div>
    );
  }

  if (expired) {
    return (
      <div className="pix-payment pix-payment-expired">
        <span className="pix-expired-icon"><Timer size={26} aria-hidden="true" /></span>
        <h4>Vamos gerar um novo código?</h4>
        <p>O código anterior expirou. Gere outro para continuar o pagamento de <b>{money(amountCents)}</b>.</p>
        {errorBox}
        <button type="button" className="pix-primary" onClick={() => void generate()}><RefreshCw size={18} aria-hidden="true" />Gerar novo código Pix</button>
        <small>Se você já pagou, confira a confirmação no aplicativo do banco antes de tentar novamente.</small>
        {verifyPayment}
      </div>
    );
  }

  return (
    <div className="pix-payment pix-payment-ready">
      <div className="pix-payment-status" role="status"><span />Aguardando pagamento{testMode ? " · demonstração" : ""}</div>
      {amount}
      <div className="pix-code-area">
        <label htmlFor="checkout-pix-code">Pix Copia e Cola</label>
        <input id="checkout-pix-code" name="pix-code" readOnly value={pix.code} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="pix-primary" onClick={() => void copy()}>
          {copyMsg?.ok ? <Check size={19} aria-hidden="true" /> : <Copy size={19} aria-hidden="true" />}
          {copyMsg?.ok ? "Código copiado" : "Copiar código Pix"}
        </button>
        {copyMsg ? <p role="status" className={copyMsg.ok ? "pix-copy-feedback" : "error"}>{copyMsg.ok ? "Agora abra o app do banco e cole o código." : copyMsg.text}</p> : null}
        <p className="pix-validity" aria-live="off"><Timer size={15} aria-hidden="true" />Código válido por <b>{pad2(Math.floor(left / 60))}:{pad2(left % 60)}</b></p>
      </div>
      {instructions}
      {testMode || pix.qrUrl ? <div className="pix-qr-content">
        {testMode ? <DemoQr seed={pix.code} /> : <Image src={pix.qrUrl!} width={224} height={224} unoptimized alt="QR Code para pagar com Pix" />}
        <p>{testMode ? "Imagem de demonstração. Não efetue pagamento." : "Em outro aparelho? Escaneie o QR Code com o app do banco."}</p>
      </div> : null}
      <p className="pix-footnote">Após pagar, volte a esta página para acompanhar a confirmação.</p>
      {verifyPayment}
      {errorBox}
      {testMode ? <button type="button" className="pix-test-action" onClick={() => void simulatePaid()} disabled={simulating}>{simulating ? "Simulando…" : "Simular pagamento aprovado"}</button> : null}
    </div>
  );
}
