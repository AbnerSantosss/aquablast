"use client";

import { Info, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Field, fullName, UFS } from "./Field";
import type { CepState, FieldKey, FormData } from "./types";

/**
 * Etapa 2 — Entrega (origem app/checkout.tsx, `body(2)`), mesmos campos, textos e comportamento: os campos de
 * endereço ficam travados até o CEP ser buscado; CEP achado preenche rua/bairro/cidade/UF; CEP não achado (ou
 * ViaCEP fora do ar) libera tudo com o aviso `.cep-manual` e mostra Cidade/Estado. "CONFIRMAR ENDEREÇO" valida
 * e revela as opções de frete; só então o botão vira CONTINUAR. A busca do CEP e o foco ficam no Checkout.
 * Estado: `<select>` nativo (o projeto não usa Radix; ver nota 2 do checkout.css).
 */
export function StepEntrega({
  data,
  onChange,
  onSubmit,
  cepState,
  addrOk,
  busy,
  buttonLabel,
  error,
}: {
  data: FormData;
  onChange: (key: FieldKey, value: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  cepState: CepState;
  addrOk: boolean;
  busy: boolean;
  buttonLabel: string;
  error: ReactNode;
}) {
  const locked = cepState === "idle" || cepState === "loading";
  const manual = cepState === "manual";
  const filled = (v: string) => !locked && !!v.trim();
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="form-fields">
        <div className="cep-row">
          <Field
            name="cep"
            label="CEP"
            placeholder="00000-000"
            value={data.cep}
            onChange={onChange}
            opts={{ autoComplete: "postal-code", inputMode: "numeric", maxLength: 9, ok: cepState === "found" || (manual && data.cep.length === 9) }}
          />
          <p className="cep-city" aria-live="polite">
            {cepState === "loading" ? (
              <>
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
                Buscando CEP…
              </>
            ) : cepState === "found" ? (
              `${data.city}/${data.state}`
            ) : manual ? (
              <span className="ck-u-sr-only">Não encontramos o CEP automaticamente. Preencha o endereço abaixo.</span>
            ) : (
              ""
            )}
          </p>
        </div>
        {manual ? (
          <p className="cep-manual">
            <Info size={17} aria-hidden="true" />
            Não encontramos o CEP automaticamente. Preencha o endereço abaixo.
          </p>
        ) : null}
        <Field name="street" label="Endereço" placeholder="Rua das Flores" value={data.street} onChange={onChange} opts={{ autoComplete: "address-line1", disabled: locked, ok: filled(data.street) }} />
        <div className="field-row num-row">
          <Field name="number" label="Número" placeholder="000" value={data.number} onChange={onChange} opts={{ maxLength: 20, disabled: locked, ok: filled(data.number) }} />
          <Field name="extra" label="Complemento" placeholder="Apt 503, Bloco 1" value={data.extra} onChange={onChange} opts={{ optional: true, autoComplete: "address-line2", disabled: locked }} />
        </div>
        <Field name="district" label="Bairro" placeholder="Centro" value={data.district} onChange={onChange} opts={{ disabled: locked, ok: filled(data.district) }} />
        {manual ? (
          <div className="field-row">
            <Field name="city" label="Cidade" placeholder="Sua cidade" value={data.city} onChange={onChange} opts={{ autoComplete: "address-level2", ok: !!data.city.trim() }} />
            <label className="field">
              <span>Estado</span>
              <select
                name="state"
                className={`ck-select state-select${data.state ? "" : " is-placeholder"}`}
                value={data.state}
                onChange={(e) => onChange("state", e.target.value)}
                autoComplete="address-level1"
              >
                <option value="">Selecione</option>
                {UFS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <Field
          name="recipient"
          label="Destinatário"
          placeholder="Nome de quem vai receber"
          value={data.recipient}
          onChange={onChange}
          opts={{ autoComplete: "name", disabled: locked, ok: !locked && fullName(data.recipient) }}
        />
      </div>
      {addrOk ? (
        <section className="ship-options" aria-labelledby="ship-title">
          <h4 id="ship-title">Opções de frete</h4>
          <p>Selecione o método de entrega desejado</p>
          <div className="ship-list" role="radiogroup" aria-labelledby="ship-title">
            <label className="ship-opt is-selected">
              <input type="radio" name="ship-option" value="full" checked readOnly />
              <span className="ship-name">
                <strong>Frete FULL</strong>
                <small>Envio rápido com rastreamento</small>
              </span>
              <span className="ship-price">
                <b>FRETE GRÁTIS</b>
                <small>Chega antes do Dia das Crianças</small>
              </span>
            </label>
          </div>
        </section>
      ) : null}
      {error}
      <div className="ck-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          {addrOk ? buttonLabel : "CONFIRMAR ENDEREÇO"}
        </button>
      </div>
    </form>
  );
}
