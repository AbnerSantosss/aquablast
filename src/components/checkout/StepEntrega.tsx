"use client";

import { Check, Info, LoaderCircle, RotateCcw } from "lucide-react";
import { useContext, useState, type ReactNode } from "react";
import { money } from "@/lib/checkout/own/masks";
import { BadFieldContext, feedbackFor, Field, fullName, UFS } from "./Field";
import type { CepState, FieldKey, FormData } from "./types";

/**
 * Etapa 2 - Entrega: os campos de
 * endereço aparecem depois da busca do CEP; a recuperação manual continua disponível quando a busca falha.
 * O frete único já aparece selecionado. Complemento e destinatário podem ser editados sem apagar seus valores.
 * A validação, a busca do CEP e o foco continuam no Checkout.
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
  shippingCents,
  error,
  onRetryCep,
}: {
  data: FormData;
  onChange: (key: FieldKey, value: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  cepState: CepState;
  addrOk: boolean;
  busy: boolean;
  buttonLabel: string;
  shippingCents: number;
  error: ReactNode;
  onRetryCep?: () => void;
}) {
  const locked = cepState === "idle" || cepState === "loading";
  const manual = cepState === "manual";
  const filled = (v: string) => !locked && !!v.trim();
  const feedback = useContext(BadFieldContext);
  const [previousNumber, setPreviousNumber] = useState("");
  const stateFeedback = feedbackFor(feedback, "state");
  const noNumber = /^s\s*\/?\s*n$/i.test(data.number.trim());
  const continueLabel = buttonLabel.trim().toUpperCase() === "CONTINUAR" ? "Ir para pagamento" : buttonLabel;
  return (
    <form onSubmit={onSubmit} noValidate data-address-confirmed={addrOk || undefined}>
      <div className="form-fields">
        <div className="cep-row">
          <Field
            name="cep"
            label="CEP"
            placeholder="00000-000"
            value={data.cep}
            onChange={onChange}
            opts={{ autoComplete: "shipping postal-code", inputMode: "numeric", maxLength: 9, enterKeyHint: "next", ok: cepState === "found" || (manual && data.cep.length === 9) }}
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
          <div className="cep-manual cep-manual-recovery">
            <Info size={17} aria-hidden="true" />
            <p>Não encontramos o CEP automaticamente. Você pode preencher o endereço abaixo.</p>
            {onRetryCep ? <button type="button" className="ck-text-action" onClick={onRetryCep} disabled={busy}><RotateCcw size={15} aria-hidden="true" /> Buscar novamente</button> : null}
          </div>
        ) : null}
        {locked ? <p className="address-reveal-help">Informe seu CEP para preencher o endereço.</p> : (
          <div className="delivery-address-fields">
            <Field name="street" label="Endereço" placeholder="Rua ou avenida" value={data.street} onChange={onChange} opts={{ autoComplete: "shipping address-line1", maxLength: 160, enterKeyHint: "next", ok: filled(data.street) }} />
            <div className="delivery-number-district">
              <Field name="number" label="Número" placeholder="000" value={data.number} onChange={onChange} opts={{ inputMode: "numeric", maxLength: 20, readOnly: noNumber, enterKeyHint: "next", ok: filled(data.number) }} />
              <Field name="district" label="Bairro" placeholder="Centro" value={data.district} onChange={onChange} opts={{ maxLength: 80, enterKeyHint: "next", ok: filled(data.district) }} />
            </div>
              <button type="button" className={`ck-number-toggle${noNumber ? " is-selected" : ""}`} aria-pressed={noNumber} onClick={() => {
                if (!noNumber) setPreviousNumber(data.number);
                onChange("number", noNumber ? previousNumber : "S/N");
              }}>
                {noNumber ? <Check size={16} aria-hidden="true" /> : null} Sem número
              </button>
            <Field name="extra" label="Complemento" placeholder="Apartamento, bloco ou referência" value={data.extra} onChange={onChange} opts={{ optional: true, autoComplete: "shipping address-line2", maxLength: 80, enterKeyHint: "next" }} />
            {manual ? <div className="field-row">
              <Field name="city" label="Cidade" placeholder="Sua cidade" value={data.city} onChange={onChange} opts={{ autoComplete: "shipping address-level2", maxLength: 80, enterKeyHint: "next", ok: !!data.city.trim() }} />
              <label className={`field${stateFeedback.bad ? " is-bad" : ""}`}>
                <span>Estado</span>
                <select
                  id="ck-state"
                  name="state"
                  className={`ck-select state-select${data.state ? "" : " is-placeholder"}`}
                  value={data.state}
                  onChange={(e) => onChange("state", e.target.value)}
                  autoComplete="shipping address-level1"
                  required
                  aria-invalid={stateFeedback.bad || undefined}
                  aria-describedby={stateFeedback.message ? "ck-state-error" : undefined}
                >
                  <option value="">Selecione</option>
                  {UFS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {stateFeedback.message ? <small className="field-error" id="ck-state-error">{stateFeedback.message}</small> : null}
              </label>
            </div> : null}
            <Field name="recipient" label="Destinatário" placeholder="Nome de quem vai receber" value={data.recipient} onChange={onChange} opts={{ autoComplete: "shipping name", autoCapitalize: "words", maxLength: 120, enterKeyHint: "done", ok: fullName(data.recipient) }} />
          </div>
        )}
      </div>
      <section className="ship-options ship-options-included" aria-labelledby="ship-title">
        <h4 id="ship-title">Sua entrega</h4>
        <div className="ship-list" role="radiogroup" aria-labelledby="ship-title">
          <label className="ship-opt is-selected">
            <input type="radio" name="ship-option" value="full" checked readOnly />
            <span className="ship-name">
              <strong>Frete FULL</strong>
              <small>Entrega com rastreamento</small>
            </span>
            <span className="ship-price">
              <b>{shippingCents === 0 ? "Grátis" : money(shippingCents)}</b>
              <small>Prazo conforme a região</small>
            </span>
          </label>
        </div>
      </section>
      {error}
      <div className="ck-actions">
        {/* Mesmo tratamento do CONTINUAR da etapa 1 (ver StepDados): sem `disabled`, giro no botão, foco mantido no campo. */}
        <button className={`primary-button${busy ? " is-loading" : ""}`} type="submit" aria-busy={busy || undefined} onMouseDown={(e) => e.preventDefault()}>
          {continueLabel}
        </button>
      </div>
    </form>
  );
}
