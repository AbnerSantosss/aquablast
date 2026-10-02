import { Check, CircleAlert } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import type { FieldKey } from "./types";

/**
 * Campo de formulário da origem (ORIGEM/app/checkout.tsx, `field()`), portado sem mudar classe nem texto
 * (fase 14.3, comparação visual): `label.field` (+ `is-disabled`/`is-ok`), rótulo com "(opcional)", input com
 * `name` igual à chave (os testes e o foco usam `input[name=...]`) e o check verde `.field-ok` quando válido.
 */
/** Campo apontado pelo último erro (popup): fica em vermelho com `aria-invalid` até o cliente mexer nele. */
export const BadFieldContext = createContext<FieldKey | null>(null);

export interface FieldOpts {
  type?: string;
  autoComplete?: string;
  maxLength?: number;
  optional?: boolean;
  inputMode?: "numeric" | "tel" | "email";
  disabled?: boolean;
  ok?: boolean;
  onBlur?: () => void;
}

export function Field({
  name,
  label,
  placeholder,
  value,
  onChange,
  opts = {},
}: {
  name: FieldKey;
  label: string;
  placeholder: string;
  value: string;
  onChange: (key: FieldKey, value: string) => void;
  opts?: FieldOpts;
}) {
  const bad = useContext(BadFieldContext) === name;
  return (
    <label className={`field${opts.disabled ? " is-disabled" : ""}${opts.ok ? " is-ok" : ""}${bad ? " is-bad" : ""}`}>
      <span>
        {label}
        {opts.optional ? <small> (opcional)</small> : null}
      </span>
      <input
        name={name}
        type={opts.type ?? "text"}
        autoComplete={opts.autoComplete}
        inputMode={opts.inputMode}
        maxLength={opts.maxLength}
        required={!opts.optional}
        aria-invalid={bad || undefined}
        disabled={opts.disabled}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        onBlur={opts.onBlur}
        placeholder={placeholder}
      />
      {opts.ok ? (
        <i className="field-ok" aria-hidden="true">
          <Check size={12} strokeWidth={3.5} />
        </i>
      ) : null}
    </label>
  );
}

/** Caixa de erro da origem (`errorBox`): um único erro por vez, com foco levado ao campo por quem chama. */
export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="error" role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      {children}
    </p>
  );
}

export const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
export const fullName = (v: string) => v.trim().split(/\s+/).length >= 2;
