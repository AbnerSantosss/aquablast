"use client";

import { startTransition, useActionState, useId, useRef, useState, type ReactNode } from "react";
import type { ActionFn } from "@/lib/admin/types";
import { SECRET_INPUT } from "./input-props";

/** Parte interativa do SecretField (Trocar / Verificar). Use sempre o SecretField, que monta o selo. */
export type SecretBadge = { tone: "green" | "red" | "orange" | "gray"; text: string };

const NO_VERIFY: ActionFn = async () => null;

export function SecretFieldClient({
  name,
  label,
  configured,
  masked,
  badge,
  canVerify,
  verifyAction,
  help,
  placeholder,
  maxLength,
}: {
  name: string;
  label: string;
  configured: boolean;
  masked: string;
  badge: SecretBadge | null;
  canVerify: boolean;
  verifyAction?: ActionFn;
  help?: ReactNode;
  placeholder?: string;
  maxLength: number;
}) {
  const [editing, setEditing] = useState(!configured);
  const [state, dispatch, pending] = useActionState(verifyAction ?? NO_VERIFY, null);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const showInput = editing || !configured;

  function startEditing() {
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function verify() {
    const fd = new FormData();
    fd.set("field", name);
    startTransition(() => dispatch(fd));
  }

  return (
    <div className="field secret-field">
      {showInput ? (
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
      ) : (
        <span className="field-label">{label}</span>
      )}

      {configured ? (
        <div className="secret-row">
          <code className="secret-mask" title="Valor salvo (mascarado)">
            {masked}
          </code>
          {badge ? <span className={`badge tone-${badge.tone}`}>{badge.text}</span> : null}
        </div>
      ) : null}

      {showInput ? (
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          maxLength={maxLength}
          placeholder={configured ? "Nova chave (em branco mantém a atual)" : placeholder}
          {...SECRET_INPUT}
        />
      ) : null}

      {!configured ? <span className="secret-hint">não configurado</span> : null}

      {configured ? (
        <div className="secret-actions">
          {editing ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>
              Cancelar troca
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-ghost" onClick={startEditing}>
              Trocar
            </button>
          )}
          {canVerify && !editing ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={verify} disabled={pending} aria-busy={pending}>
              {pending ? "Verificando…" : "Verificar"}
            </button>
          ) : null}
        </div>
      ) : null}

      {editing && configured ? <span className="hint">Salve para usar a chave nova; depois clique em Verificar. Em branco, a atual fica.</span> : null}
      {help ? <span className="hint">{help}</span> : null}
      {state ? (
        <div className={`af-result ${state.ok ? "is-ok" : "is-err"}`} role="status">
          {state.message}
        </div>
      ) : null}
    </div>
  );
}
