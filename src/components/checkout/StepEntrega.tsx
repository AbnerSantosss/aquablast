"use client";

import { useState } from "react";
import { maskCEP, onlyDigits } from "@/lib/checkout/own/masks";
import type { AddressData } from "./types";

type ViaCep = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

/**
 * Busca o CEP na ViaCEP com timeout de 5s (plano 8.7). Falha ou timeout => `null`, e quem chama cai
 * para o preenchimento manual (`.cep-manual`) — nunca inventa endereço.
 */
async function lookupCep(cep: string): Promise<ViaCep | null> {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as ViaCep;
    if (data.erro) return null;
    return data;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Etapa 2 — Entrega (origem app/checkout.tsx, `body(1)`). */
export function StepEntrega({
  address,
  onChange,
  onSubmit,
  submitting,
  error,
}: {
  address: AddressData;
  onChange: (patch: Partial<AddressData>) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [manual, setManual] = useState(false);
  const [looking, setLooking] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [touched, setTouched] = useState(false);

  const handleCepChange = (value: string) => {
    const masked = maskCEP(value);
    onChange({ cep: masked });
    setNotFound(false);
    if (onlyDigits(masked).length === 8) void runLookup(masked);
  };

  const runLookup = async (cep: string) => {
    setLooking(true);
    const found = await lookupCep(cep);
    setLooking(false);
    if (!found) {
      setNotFound(true);
      setManual(true);
      return;
    }
    onChange({
      street: found.logradouro ?? "",
      district: found.bairro ?? "",
      city: found.localidade ?? "",
      state: found.uf ?? "",
    });
    setManual(false);
  };

  const cepOk = onlyDigits(address.cep).length === 8;
  const streetOk = address.street.trim().length >= 2;
  const numberOk = address.number.trim().length >= 1;
  const districtOk = address.district.trim().length >= 2;
  const cityOk = address.city.trim().length >= 2;
  const stateOk = address.state.trim().length === 2;
  const recipientOk = address.recipient.trim().length >= 3;
  const valid = cepOk && streetOk && numberOk && districtOk && cityOk && stateOk && recipientOk;

  const submit = () => {
    setTouched(true);
    if (valid) onSubmit();
  };

  return (
    <div className="ck-step-body">
      <div className="form-fields">
        <div className="cep-row">
          <label className="field">
            <span>CEP</span>
            <input
              value={address.cep}
              onChange={(e) => handleCepChange(e.target.value)}
              placeholder="00000-000"
              inputMode="numeric"
              autoComplete="postal-code"
            />
          </label>
          {looking ? <span className="cep-city">buscando…</span> : null}
          {!looking && !manual && address.city ? (
            <span className="cep-city">
              {address.city}/{address.state}
            </span>
          ) : null}
        </div>

        {notFound ? <p className="error">CEP não encontrado. Preencha o endereço manualmente.</p> : null}

        {!manual ? (
          <button type="button" className="cep-manual" onClick={() => setManual(true)}>
            Não é o endereço certo? Preencher manualmente
          </button>
        ) : null}

        <label className="field">
          <span>Rua</span>
          <input value={address.street} onChange={(e) => onChange({ street: e.target.value })} disabled={!manual && looking} autoComplete="address-line1" />
        </label>

        <div className="num-row">
          <label className="field">
            <span>Número</span>
            <input value={address.number} onChange={(e) => onChange({ number: e.target.value })} autoComplete="off" />
          </label>
          <label className="field">
            <span>Complemento (opcional)</span>
            <input value={address.extra} onChange={(e) => onChange({ extra: e.target.value })} placeholder="Apto, bloco…" autoComplete="address-line2" />
          </label>
        </div>

        <label className="field">
          <span>Bairro</span>
          <input value={address.district} onChange={(e) => onChange({ district: e.target.value })} disabled={!manual && looking} autoComplete="address-level3" />
        </label>

        <div className="field-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr" }}>
          <label className="field">
            <span>Cidade</span>
            <input value={address.city} onChange={(e) => onChange({ city: e.target.value })} disabled={!manual && looking} autoComplete="address-level2" />
          </label>
          <label className="field">
            <span>UF</span>
            <input
              value={address.state}
              onChange={(e) => onChange({ state: e.target.value.toUpperCase().slice(0, 2) })}
              disabled={!manual && looking}
              autoComplete="address-level1"
              maxLength={2}
            />
          </label>
        </div>

        <label className="field">
          <span>Quem recebe</span>
          <input value={address.recipient} onChange={(e) => onChange({ recipient: e.target.value })} placeholder="Nome de quem vai receber" autoComplete="name" />
        </label>
      </div>

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

      {touched && !valid ? <p className="error">Confira o endereço completo antes de continuar.</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="ck-actions">
        <button type="button" className={`primary-button${submitting ? " spin" : ""}`} onClick={submit} disabled={submitting}>
          Continuar
        </button>
      </div>
    </div>
  );
}
