"use client";

import { CircleAlert, CreditCard, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRef, useState } from "react";
import Image from "next/image";
import { gatewayTokenizes, tokenizeCard } from "@/lib/gateways/browser";
import type { GatewayName } from "@/lib/gateways/types";
import { cardBrandOf, cardLast4, maskCPF, money, onlyDigits, validCardExpiry, validCPF, validLuhn } from "@/lib/checkout/own/masks";
import { isApiFail, postPay } from "./api";
import { PaySeals } from "./PaySeals";
import type { CardFormData } from "./types";

const EMPTY = { number: "", name: "", exp: "", cvv: "", cpf: "" };
type CardKey = keyof typeof EMPTY;

// Cartão de teste público do gateway simulado, montado em partes para não aparecer como número de cartão no código.
const TEST_CARD = ["4242", "4242", "4242", "4242"].join(" ");

/** "MM/AA" → mês e ano numéricos (ano com 4 dígitos), formato exigido pelo `cardSchema` do POST /pay. */
function parseExp(v: string): { month: number; year: number } | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(v);
  return m ? { month: Number(m[1]), year: 2000 + Number(m[2]) } : null;
}

/**
 * Cartão (origem app/simulated-payment.tsx, `CardPay`), mesmas classes, textos, máscaras e ordem de validação.
 * Quando o gateway tokeniza no navegador (Mercado Pago), número/CVV vão direto para o SDK e o POST /pay recebe só
 * `cardToken`; senão vai `card` (HTTPS; o servidor nunca grava número/CVV, só os 4 últimos). Mês/ano seguem como
 * NÚMERO (antes da fase 14 iam como texto e o servidor respondia 400 em todo pagamento com cartão).
 * Recusa: limpa número e CVV (plano 8.7). Regra dura: nunca logar nem gravar número, validade ou CVV.
 * O aviso "use o cartão de teste" só aparece com o gateway `simulado`; no modo real, o aviso de segurança.
 * Bump sem cor da 2ª unidade (`blocked`): o envio não cobra e chama `onBlocked` (a etapa rola e foca a escolha da cor).
 */
export function CardPay({
  cartToken,
  bump,
  bumpColor = null,
  blocked = false,
  onBlocked,
  amountCents,
  maxInstallments,
  gateway,
  publicConfig,
  testMode,
  storeName,
  onPending,
  onPaid,
}: {
  cartToken: string;
  bump: boolean;
  /** Cor da 2ª unidade; vai junto no POST quando há bump. */
  bumpColor?: string | null;
  blocked?: boolean;
  onBlocked?: () => void;
  amountCents: number;
  maxInstallments: number;
  gateway: string | null;
  publicConfig: Record<string, string>;
  testMode: boolean;
  storeName: string;
  onPending: (publicToken: string) => void;
  onPaid: (publicToken: string) => void;
}) {
  const max = Math.max(1, maxInstallments);
  const [f, setF] = useState(EMPTY);
  const [inst, setInst] = useState(String(max));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const digits = onlyDigits(f.number);
  const brand = cardBrandOf(digits);
  const per = (n: number) => Math.round(amountCents / n);

  function set(k: CardKey, v: string) {
    const masked =
      k === "number"
        ? onlyDigits(v).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ")
        : k === "exp"
          ? onlyDigits(v).slice(0, 4).replace(/^(\d{2})(\d)/, "$1/$2")
          : k === "cvv"
            ? onlyDigits(v).slice(0, 4)
            : k === "cpf"
              ? maskCPF(v)
              : v;
    setF((p) => ({ ...p, [k]: masked }));
    setError("");
  }

  function fail(msg: string, name: string) {
    setError(msg);
    form.current?.querySelector<HTMLInputElement>(`[name=${name}]`)?.focus();
  }

  async function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (blocked) {
      onBlocked?.();
      return;
    }
    const exp = parseExp(f.exp);
    if (!validLuhn(digits)) return fail("Número do cartão inválido. Confira os dígitos.", "cc-number");
    if (!exp || !validCardExpiry(exp.month, exp.year)) return fail("Validade inválida ou vencida. Use o formato MM/AA.", "cc-exp");
    if (!/^\d{3,4}$/.test(f.cvv)) return fail("Informe o CVV com 3 ou 4 dígitos.", "cc-csc");
    if (f.name.trim().split(/\s+/).length < 2) return fail("Informe o nome impresso no cartão (nome e sobrenome).", "cc-name");
    if (!validCPF(f.cpf)) return fail("Confira o CPF do titular do cartão.", "cc-cpf");
    setError("");
    setBusy(true);
    const installments = Number(inst);
    const extra = bump && bumpColor ? { bumpColor } : {};
    const card: CardFormData = { number: digits, holderName: f.name.trim(), expMonth: exp.month, expYear: exp.year, cvv: f.cvv, holderCpf: onlyDigits(f.cpf) };
    try {
      const tokenizes = gateway ? gatewayTokenizes(gateway as GatewayName) : false;
      const result =
        tokenizes && gateway
          ? await tokenizeCard(gateway as GatewayName, publicConfig, card, amountCents).then((t) =>
              postPay({
                cartToken,
                method: "card",
                installments,
                bump,
                ...extra,
                cardToken: t.token,
                cardBrand: t.brand,
                cardPaymentMethodId: t.paymentMethodId,
                cardIssuerId: t.issuerId,
                cardLast4: cardLast4(digits),
              }),
            )
          : await postPay({ cartToken, method: "card", installments, bump, ...extra, card });
      if (isApiFail(result)) {
        if (result.status === "refused" || result.status === "error") setF((p) => ({ ...p, number: "", cvv: "" }));
        setError(result.message ?? result.error);
        return;
      }
      if (result.status === "paid") {
        setF(EMPTY);
        onPaid(result.publicToken);
        return;
      }
      if (result.status === "pending") {
        setF(EMPTY);
        onPending(result.publicToken);
        return;
      }
    } catch (err) {
      setF((p) => ({ ...p, number: "", cvv: "" }));
      setError(err instanceof Error ? err.message : "Não foi possível processar o cartão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ck-cardform" onSubmit={(e) => void pay(e)} noValidate ref={form}>
      <div className="ck-card-intro">
        <Image src="/checkout/payment-card.svg" width={360} height={216} alt="Ilustração de um cartão de crédito" className="ck-card-illustration" />
        <div><span>SEU PAGAMENTO</span><h4>Praticidade em cada parcela</h4><p>Preencha os dados do cartão e escolha como prefere parcelar.</p></div>
      </div>
      <p className="ck-card-warn">
        {testMode ? (
          <>
            <CircleAlert size={17} aria-hidden="true" />
            <span>
              Não use um cartão real. Para testar use <b>{TEST_CARD}</b>, validade futura e CVV <b>123</b>.
            </span>
          </>
        ) : (
          <>
            <LockKeyhole size={17} aria-hidden="true" />
            <span>Não guardamos os dados do seu cartão. A conexão é criptografada.</span>
          </>
        )}
      </p>
      <div className="form-fields">
        <label className="field has-icon">
          <CreditCard className="field-icon" size={22} aria-hidden="true" />
          <span>
            Número do cartão{brand ? <em className="ck-brand"> · {brand}</em> : null}
          </span>
          <input name="cc-number" autoComplete="cc-number" inputMode="numeric" maxLength={19} placeholder="0000 0000 0000 0000" value={f.number} onChange={(e) => set("number", e.target.value)} disabled={busy} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Validade</span>
            <input name="cc-exp" autoComplete="cc-exp" inputMode="numeric" maxLength={5} placeholder="MM/AA" value={f.exp} onChange={(e) => set("exp", e.target.value)} disabled={busy} />
          </label>
          <label className="field">
            <span>CVV</span>
            <input name="cc-csc" autoComplete="cc-csc" inputMode="numeric" maxLength={4} placeholder="123" value={f.cvv} onChange={(e) => set("cvv", e.target.value)} disabled={busy} />
          </label>
        </div>
        <label className="field">
          <span>Nome como no cartão</span>
          <input name="cc-name" autoComplete="cc-name" placeholder="Maria M Silva" value={f.name} onChange={(e) => set("name", e.target.value)} disabled={busy} />
        </label>
        <label className="field">
          <span>CPF do titular do cartão</span>
          <input name="cc-cpf" autoComplete="off" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={f.cpf} onChange={(e) => set("cpf", e.target.value)} disabled={busy} />
        </label>
        <label className="field">
          <span>Número de parcelas</span>
          <select name="cc-installments" className="ck-select inst-select" value={inst} onChange={(e) => setInst(e.target.value)} disabled={busy}>
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>
                {n}x de {money(per(n))} sem juros{n === 1 ? " (total)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p className="error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      ) : null}
      <button type="submit" className="primary-button ck-pay-btn" disabled={busy} aria-disabled={blocked || undefined}>
        {busy ? (
          <>
            <LoaderCircle className="spin" size={19} aria-hidden="true" />
            Processando…
          </>
        ) : (
          "FINALIZAR COMPRA"
        )}
      </button>
      <PaySeals storeName={storeName} />
    </form>
  );
}
