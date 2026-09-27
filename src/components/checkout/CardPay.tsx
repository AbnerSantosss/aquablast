"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import { gatewayTokenizes, tokenizeCard } from "@/lib/gateways/browser";
import type { GatewayName } from "@/lib/gateways/types";
import { cardBrandOf, cardLast4, money, onlyDigits, validCardExpiry, validCPF, validLuhn } from "@/lib/checkout/own/masks";
import { isApiFail, postPay } from "./api";
import type { CardFormData } from "./types";

const EMPTY_CARD: CardFormData = { number: "", holderName: "", expMonth: "", expYear: "", cvv: "", holderCpf: "" };

/**
 * Formulário de cartão real (plano 8.6/8.7/9). Quando o gateway tokeniza no navegador (Mercado Pago,
 * ver @/lib/gateways/browser), o número/CVV vão direto pro SDK e nunca chegam ao nosso POST /pay —
 * mandamos `cardToken`; senão mandamos `card` em claro (HTTPS, e o servidor nunca grava número/CVV,
 * só `cardLast4`). Regra dura: nunca `console.log`/gravar número, validade ou CVV aqui.
 */
export function CardPay({
  cartToken,
  bump,
  amountCents,
  maxInstallments,
  gateway,
  publicConfig,
  testMode,
  onPending,
  onPaid,
}: {
  cartToken: string;
  bump: boolean;
  amountCents: number;
  maxInstallments: number;
  gateway: string | null;
  publicConfig: Record<string, string>;
  testMode: boolean;
  onPending: (message: string | null, orderNumber: string, publicToken: string) => void;
  onPaid: (orderNumber: string, publicToken: string) => void;
}) {
  const [card, setCard] = useState<CardFormData>(EMPTY_CARD);
  const [installments, setInstallments] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const patch = (p: Partial<CardFormData>) => setCard((c) => ({ ...c, ...p }));

  const brand = cardBrandOf(card.number);
  const numberOk = validLuhn(card.number);
  const monthNum = Number(card.expMonth);
  const yearNum = Number(card.expYear.length === 2 ? `20${card.expYear}` : card.expYear);
  const expOk = validCardExpiry(monthNum, yearNum);
  const cvvOk = onlyDigits(card.cvv).length >= 3 && onlyDigits(card.cvv).length <= 4;
  const nameOk = card.holderName.trim().length >= 3;
  const cpfOk = validCPF(card.holderCpf);
  const valid = numberOk && expOk && cvvOk && nameOk && cpfOk;

  const installmentCents = Math.round(amountCents / installments);

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (!valid) return;
    setSubmitting(true);
    try {
      const tokenizes = gateway ? gatewayTokenizes(gateway as GatewayName) : false;
      let result;
      if (tokenizes && gateway) {
        const tokenized = await tokenizeCard(
          gateway as GatewayName,
          publicConfig,
          { number: card.number, holderName: card.holderName, expMonth: monthNum, expYear: yearNum, cvv: card.cvv, holderCpf: card.holderCpf },
          amountCents,
        );
        result = await postPay({
          cartToken,
          method: "card",
          installments,
          bump,
          cardToken: tokenized.token,
          cardBrand: tokenized.brand,
          cardPaymentMethodId: tokenized.paymentMethodId,
          cardIssuerId: tokenized.issuerId,
          cardLast4: cardLast4(card.number),
        });
      } else {
        result = await postPay({ cartToken, method: "card", installments, bump, card });
      }

      if (isApiFail(result)) {
        setError(result.error);
        return;
      }
      if (result.status === "paid") {
        onPaid(result.orderNumber, result.publicToken);
        return;
      }
      if (result.status === "pending") {
        onPending(result.message, result.orderNumber, result.publicToken);
        return;
      }
      // refused ou error: mantém nome/CPF, limpa número e CVV (nunca reaproveita dado sensível recusado).
      setCard((c) => ({ ...c, number: "", cvv: "" }));
      setError(result.message ?? "Não foi possível aprovar o pagamento. Confira os dados do cartão ou tente outro cartão.");
    } catch (err) {
      setCard((c) => ({ ...c, number: "", cvv: "" }));
      setError(err instanceof Error ? err.message : "Não foi possível processar o cartão. Tente de novo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="payment-content ck-cardform">
      <div className="form-fields">
        <label className="field has-icon">
          <span>Número do cartão</span>
          <input value={card.number} onChange={(e) => patch({ number: onlyDigits(e.target.value).slice(0, 19) })} inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" />
          {brand ? <span className="ck-brand">{brand}</span> : null}
        </label>
        <label className="field">
          <span>Nome impresso no cartão</span>
          <input value={card.holderName} onChange={(e) => patch({ holderName: e.target.value })} autoComplete="cc-name" placeholder="Como está no cartão" />
        </label>
        <div className="field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
          <label className="field">
            <span>Mês</span>
            <input value={card.expMonth} onChange={(e) => patch({ expMonth: onlyDigits(e.target.value).slice(0, 2) })} inputMode="numeric" placeholder="MM" autoComplete="cc-exp-month" />
          </label>
          <label className="field">
            <span>Ano</span>
            <input value={card.expYear} onChange={(e) => patch({ expYear: onlyDigits(e.target.value).slice(0, 4) })} inputMode="numeric" placeholder="AAAA" autoComplete="cc-exp-year" />
          </label>
          <label className="field">
            <span>CVV</span>
            <input value={card.cvv} onChange={(e) => patch({ cvv: onlyDigits(e.target.value).slice(0, 4) })} inputMode="numeric" placeholder="123" autoComplete="cc-csc" />
          </label>
        </div>
        <label className="field">
          <span>CPF do titular</span>
          <input value={card.holderCpf} onChange={(e) => patch({ holderCpf: onlyDigits(e.target.value).slice(0, 11) })} inputMode="numeric" placeholder="000.000.000-00" autoComplete="off" />
        </label>
        <label className="field">
          <span>Parcelas</span>
          <select
            className={`ck-select${installments === 0 ? " is-placeholder" : ""}`}
            value={installments}
            onChange={(e) => setInstallments(Number(e.target.value))}
          >
            {Array.from({ length: Math.max(1, maxInstallments) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}x de {money(Math.round(amountCents / n))} sem juros
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="ck-card-warn">
        <Lock aria-hidden="true" size={14} /> Não guardamos os dados do seu cartão. A conexão é criptografada.
      </p>

      {testMode ? <p className="ck-testmode">Modo de teste: nenhuma cobrança real será feita.</p> : null}

      {touched && !valid ? <p className="error">Confira número, validade, CVV, nome e CPF do cartão.</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="ck-actions">
        <button type="button" className={`primary-button${submitting ? " spin" : ""}`} onClick={() => void submit()} disabled={submitting}>
          Pagar {money(installments > 1 ? installmentCents : amountCents)}
          {installments > 1 ? ` em ${installments}x` : ""}
        </button>
      </div>
    </div>
  );
}
