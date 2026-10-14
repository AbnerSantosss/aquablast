"use client";

import { Check, Info, LoaderCircle, RotateCcw } from "lucide-react";
import { useContext, useState, type ReactNode } from "react";
import { money } from "@/lib/checkout/own/masks";
import { FREE_SHIPPING_LABEL, FULL_SHIPPING_CENTS, FULL_SHIPPING_LABEL, type ShippingMethod } from "@/lib/checkout/own/shipping";
import { ehCapital, prazoDeEntrega } from "@/lib/checkout/own/prazo";
import { BadFieldContext, feedbackFor, Field, fullName, UFS } from "./Field";
import type { CepState, FieldKey, FormData } from "./types";

/**
 * Etapa 2 - Entrega: os campos de
 * endereço aparecem depois da busca do CEP; a recuperação manual continua disponível quando a busca falha.
 * O frete grátis já aparece selecionado; o Frete FULL é a opção paga, e só aqui o preço dele aparece. Complemento e destinatário podem ser editados sem apagar seus valores.
 * A validação, a busca do CEP e o foco continuam no Checkout.
 * Estado: `<select>` nativo (o projeto não usa Radix; ver nota 2 do checkout.css).
 */
const SHIP_OPTIONS: { value: ShippingMethod; label: string; cents: number }[] = [
  { value: "free", label: FREE_SHIPPING_LABEL, cents: 0 },
  { value: "full", label: FULL_SHIPPING_LABEL, cents: FULL_SHIPPING_CENTS },
];

export function StepEntrega({
  data,
  onChange,
  onSubmit,
  cepState,
  addrOk,
  busy,
  buttonLabel,
  shipping,
  onShippingChange,
  error,
  onRetryCep,
  hideSubmit = false,
  onAddressBlur,
}: {
  data: FormData;
  onChange: (key: FieldKey, value: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  cepState: CepState;
  addrOk: boolean;
  busy: boolean;
  buttonLabel: string;
  shipping: ShippingMethod;
  onShippingChange: (value: ShippingMethod) => void;
  error: ReactNode;
  onRetryCep?: () => void;
  /** Checkout em uma página (2026-10-14): sem o botão "Ir para pagamento"; o Enter não envia nada (quem cobra é o botão de pagar). */
  hideSubmit?: boolean;
  /** Checkout em uma página: sair do número ou do destinatário (o último campo) grava o carrinho em silêncio, se o endereço já está completo. */
  onAddressBlur?: () => void;
}) {
  const locked = cepState === "idle" || cepState === "loading";
  const manual = cepState === "manual";
  const filled = (v: string) => !locked && !!v.trim();
  const feedback = useContext(BadFieldContext);
  const [previousNumber, setPreviousNumber] = useState("");
  const stateFeedback = feedbackFor(feedback, "state");
  const noNumber = /^s\s*\/?\s*n$/i.test(data.number.trim());
  const continueLabel = buttonLabel.trim().toUpperCase() === "CONTINUAR" ? "Ir para pagamento" : buttonLabel;
  const capital = locked ? null : ehCapital(data.city, data.state);
  const capitalLabel = capital === null
    ? "Digite o CEP para ver o prazo de entrega."
    : `Prazos para ${data.city.trim()}/${data.state.trim().toUpperCase()} (${capital ? "capital" : "fora da capital"}).`;
  return (
    <form onSubmit={hideSubmit ? (e) => e.preventDefault() : onSubmit} noValidate data-address-confirmed={addrOk || undefined}>
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
              <Field name="number" label="Número" placeholder="000" value={data.number} onChange={onChange} opts={{ inputMode: "numeric", maxLength: 20, readOnly: noNumber, enterKeyHint: "next", ok: filled(data.number), onBlur: onAddressBlur }} />
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
            <Field name="recipient" label="Destinatário" placeholder="Nome de quem vai receber" value={data.recipient} onChange={onChange} opts={{ autoComplete: "shipping name", autoCapitalize: "words", maxLength: 120, enterKeyHint: "done", ok: fullName(data.recipient), onBlur: onAddressBlur }} />
          </div>
        )}
      </div>
      <section className="ship-options ship-options-included" aria-labelledby="ship-title">
        <h4 id="ship-title">Sua entrega</h4>
        {/* Prazo pelo endereço que a consulta do CEP preencheu: capital ou demais cidades (prazo.ts). */}
        <p className="ship-region">{capitalLabel}</p>
        <div className="ship-list" role="radiogroup" aria-labelledby="ship-title">
          {SHIP_OPTIONS.map((opt) => (
            <label className={`ship-opt${shipping === opt.value ? " is-selected" : ""}`} key={opt.value}>
              <input type="radio" name="ship-option" value={opt.value} checked={shipping === opt.value} onChange={() => onShippingChange(opt.value)} />
              <span className="ship-name">
                <strong>{opt.label}</strong>
                <small>{prazoDeEntrega(opt.value, data.city, data.state) ? `Chega em ${prazoDeEntrega(opt.value, data.city, data.state)}, com rastreamento` : "Com rastreamento"}</small>
              </span>
              <span className="ship-price">
                <b>{opt.cents === 0 ? "Grátis" : money(opt.cents)}</b>
              </span>
            </label>
          ))}
        </div>
      </section>
      {error}
      {hideSubmit ? null : <div className="ck-actions">
        {/* Mesmo tratamento do CONTINUAR da etapa 1 (ver StepDados): sem `disabled`, giro no botão, foco mantido no campo. */}
        <button className={`primary-button${busy ? " is-loading" : ""}`} type="submit" aria-busy={busy || undefined} onMouseDown={(e) => e.preventDefault()}>
          {continueLabel}
        </button>
      </div>}
    </form>
  );
}
