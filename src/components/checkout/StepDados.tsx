"use client";

import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { validCPF, validMobile } from "@/lib/checkout/own/masks";
import { Field, fullName, validEmail } from "./Field";
import type { FieldKey, FormData } from "./types";

/**
 * Etapa 1 — Seus dados (origem app/checkout.tsx, `body(1)`), mesmos campos, textos e ordem. A validação que
 * bloqueia fica no Checkout (`next`, mesma ordem de mensagens da origem) e a que decide é a do servidor
 * (POST /api/checkout/cart). `onEmailBlur` dispara o salvamento parcial (plano 8.7).
 * Carrinho retomado (plano 8.8): o CPF gravado aparece só mascarado no placeholder; vazio = manter o gravado.
 */
export function StepDados({
  data,
  onChange,
  onEmailBlur,
  onSubmit,
  cpfMasked,
  busy,
  buttonLabel,
  error,
}: {
  data: FormData;
  onChange: (key: FieldKey, value: string) => void;
  onEmailBlur: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  cpfMasked: string | null;
  busy: boolean;
  buttonLabel: string;
  error: ReactNode;
}) {
  const keepCpf = !!cpfMasked && data.cpf === "";
  const ready = fullName(data.name) && validEmail(data.email) && validMobile(data.phone) && (validCPF(data.cpf) || keepCpf) && !busy;
  return (
    <form onSubmit={onSubmit}>
      <div className="form-fields">
        <Field name="name" label="Nome completo" placeholder="Como está no seu documento" value={data.name} onChange={onChange} opts={{ autoComplete: "name", ok: fullName(data.name) }} />
        <Field
          name="email"
          label="E-mail"
          placeholder="voce@exemplo.com"
          value={data.email}
          onChange={onChange}
          opts={{ type: "email", autoComplete: "email", ok: validEmail(data.email), onBlur: onEmailBlur }}
        />
        <div className="field-row id-row">
          <Field
            name="phone"
            label="Celular com DDD"
            placeholder="(00) 00000-0000"
            value={data.phone}
            onChange={onChange}
            opts={{ type: "tel", autoComplete: "tel", inputMode: "tel", maxLength: 15, ok: validMobile(data.phone) }}
          />
          <Field
            name="cpf"
            label="CPF"
            placeholder={cpfMasked ?? "000.000.000-00"}
            value={data.cpf}
            onChange={onChange}
            opts={{ inputMode: "numeric", maxLength: 14, ok: validCPF(data.cpf) || keepCpf, optional: keepCpf }}
          />
        </div>
        <p className="inline-help">
          <LockKeyhole size={14} aria-hidden="true" /> Usaremos seus dados só para acompanhar esta compra.
        </p>
      </div>
      {error}
      <div className="ck-actions">
        <button className={`primary-button${ready ? " is-ready" : ""}`} type="submit" disabled={busy}>
          {buttonLabel}
        </button>
      </div>
    </form>
  );
}
