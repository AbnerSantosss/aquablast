"use client";

import { useState } from "react";
import { maskCPF, maskPhone, validCPF, validMobile } from "@/lib/checkout/own/masks";
import type { CustomerData } from "./types";

/**
 * Etapa 1 — Dados (origem app/checkout.tsx, `body(0)`). Validação aqui é só de conforto (feedback
 * imediato); a validação que decide é sempre a do servidor (POST /api/checkout/cart, mesmas regras de
 * @/lib/checkout/own/masks). `onEmailBlur` dispara o salvamento parcial (plano 8.7) — só quando o
 * consentimento já foi respondido, decisão de quem chama este componente (Checkout.tsx).
 */
export function StepDados({
  customer,
  cpfMasked,
  onChange,
  onEmailBlur,
  onSubmit,
  submitting,
  error,
}: {
  customer: CustomerData;
  /** Carrinho retomado (plano 8.8): CPF já gravado, mostrado só mascarado. Campo vazio = manter o gravado. */
  cpfMasked?: string | null;
  onChange: (patch: Partial<CustomerData>) => void;
  onEmailBlur: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [touched, setTouched] = useState(false);

  const nameOk = customer.name.trim().length >= 3;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim());
  const phoneOk = validMobile(customer.phone);
  const cpfOk = validCPF(customer.cpf) || (!!cpfMasked && customer.cpf === "");
  const valid = nameOk && emailOk && phoneOk && cpfOk;

  const submit = () => {
    setTouched(true);
    if (valid) onSubmit();
  };

  return (
    <div className="ck-step-body">
      <div className="form-fields">
        <label className="field">
          <span>Nome completo</span>
          <input
            value={customer.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Seu nome completo"
            autoComplete="name"
          />
        </label>
        <label className="field">
          <span>E-mail</span>
          <input
            type="email"
            value={customer.email}
            onChange={(e) => onChange({ email: e.target.value })}
            onBlur={onEmailBlur}
            placeholder="voce@email.com"
            autoComplete="email"
          />
        </label>
        <div className="field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <label className="field">
            <span>Celular (WhatsApp)</span>
            <input
              value={customer.phone}
              onChange={(e) => onChange({ phone: maskPhone(e.target.value) })}
              placeholder="(11) 91234-5678"
              inputMode="numeric"
              autoComplete="tel"
            />
          </label>
          <label className="field">
            <span>CPF</span>
            <input
              value={customer.cpf}
              onChange={(e) => onChange({ cpf: maskCPF(e.target.value) })}
              placeholder={cpfMasked ?? "000.000.000-00"}
              inputMode="numeric"
              autoComplete="off"
            />
            {cpfMasked && customer.cpf === "" ? <small>CPF já informado. Preencha só se quiser corrigir.</small> : null}
          </label>
        </div>
      </div>

      {touched && !valid ? (
        <p className="error" style={{ color: "#9b1c13" }}>
          Confira nome, e-mail, celular e CPF antes de continuar.
        </p>
      ) : null}
      {error ? (
        <p className="error" style={{ color: "#9b1c13" }}>
          {error}
        </p>
      ) : null}

      <div className="ck-actions">
        <button type="button" className={`primary-button${submitting ? " spin" : ""}`} onClick={submit} disabled={submitting}>
          Continuar
        </button>
      </div>
    </div>
  );
}
