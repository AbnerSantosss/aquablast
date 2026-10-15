"use client";

import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { validMobile } from "@/lib/checkout/own/masks";
import { emailOk } from "./explain";
import { Field, fullName } from "./Field";
import type { FieldKey, FormData } from "./types";

/**
 * Etapa 1 — Seus dados (origem app/checkout.tsx, `body(1)`), mesmos campos, textos e ordem. A validação que
 * bloqueia fica no Checkout (`next`, mesma ordem de mensagens da origem) e a que decide é a do servidor
 * (POST /api/checkout/cart). `onContactBlur` (sair do e-mail ou do celular) dispara o salvamento parcial (plano 8.7).
 * `noValidate` (2026-10-02): sem ele o navegador barrava o envio com o balão nativo (e-mail sem ".com", campo
 * vazio) antes do `next`, e no navegador do Instagram/Facebook o balão nem aparece: o botão parecia travado.
 * O CPF não está aqui: é pedido no Pix ou no cartão, na etapa de pagamento.
 */
export function StepDados({
  data,
  onChange,
  onContactBlur,
  onSubmit,
  busy,
  buttonLabel,
  error,
  hideSubmit = false,
}: {
  data: FormData;
  onChange: (key: FieldKey, value: string) => void;
  onContactBlur: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  buttonLabel: string;
  error: ReactNode;
  /** Checkout em uma página (2026-10-14): sem o botão "Ir para entrega"; o Enter não envia nada (quem cobra é o botão de pagar). */
  hideSubmit?: boolean;
}) {
  const ready = fullName(data.name) && emailOk(data.email) && validMobile(data.phone) && !busy;
  const continueLabel = buttonLabel.trim().toUpperCase() === "CONTINUAR" ? "Ir para entrega" : buttonLabel;
  return (
    <form onSubmit={hideSubmit ? (e) => e.preventDefault() : onSubmit} noValidate>
      <div className="form-fields">
        <Field name="name" label="Nome completo" placeholder="Digite seu nome completo" value={data.name} onChange={onChange} opts={{ autoComplete: "name", autoCapitalize: "words", maxLength: 120, enterKeyHint: "next", ok: fullName(data.name) }} />
        <Field
          name="email"
          label="E-mail"
          placeholder="Digite seu melhor e-mail"
          value={data.email}
          onChange={onChange}
          opts={{ type: "email", inputMode: "email", autoComplete: "email", autoCapitalize: "none", autoCorrect: "off", spellCheck: false, maxLength: 160, enterKeyHint: "next", ok: emailOk(data.email), onBlur: onContactBlur }}
        />
        <Field
          name="phone"
          label="Celular com DDD"
          placeholder="(00) 00000-0000"
          value={data.phone}
          onChange={onChange}
          opts={{ type: "tel", autoComplete: "tel", inputMode: "tel", maxLength: 20, enterKeyHint: "done", ok: validMobile(data.phone), onBlur: onContactBlur }}
        />
        {/* Cada finalidade abaixo descreve o que o código faz (auditoria de 2026-10-11): o checkout não cria conta de
            cliente; o e-mail recebe a confirmação e o rastreio; o celular fica no pedido para contato. Não citar nota fiscal: o sistema não emite. O texto é curto de
            propósito: cabe em duas linhas na coluna do computador (uma a mais que a frase antiga). */}
        <p className="inline-help">
          <LockKeyhole size={14} aria-hidden="true" />
          <span>
            <strong>Compra rápida, sem precisar criar uma conta.</strong> E-mail: confirmação e rastreio do pedido. Celular: contato
            sobre o pedido.
          </span>
        </p>
      </div>
      {error}
      {hideSubmit ? null : <div className="ck-actions">
        {/* Sem `disabled` (2026-10-03): o botão apagado parecia morto e o toque nele não dava retorno. Ocupado = giro no
            próprio botão (`is-loading`) e `aria-busy`; o envio em dobro é barrado em `next` (Checkout). O mousedown sem
            ação padrão mantém o foco no campo: o 1º toque não fecha o teclado nem move a tela debaixo do dedo. */}
        <button
          className={`primary-button${ready ? " is-ready" : ""}${busy ? " is-loading" : ""}`}
          type="submit"
          aria-busy={busy || undefined}
          onMouseDown={(e) => e.preventDefault()}
        >
          {continueLabel}
        </button>
      </div>}
    </form>
  );
}
