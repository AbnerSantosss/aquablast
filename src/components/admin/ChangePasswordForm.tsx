"use client";

import { startTransition, useActionState, useEffect, useId, type BaseSyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changeOwnPassword } from "@/lib/admin/actions/settings";
import { PASSWORD_MAX, PASSWORD_MIN, changePasswordSchema, type ChangePasswordInput, type ChangePasswordValues } from "@/lib/admin/schemas/auth";
import { PasswordInput } from "@/components/admin/PasswordInput";

const FIELDS = ["currentPassword", "newPassword", "confirmPassword"] as const;
type FieldName = (typeof FIELDS)[number];

/**
 * "Trocar minha senha" em Configurações. react-hook-form valida no cliente; a action confere a
 * senha atual, grava a nova e reemite a sessão (quem trocou não cai).
 * Como a action é chamada à mão (startTransition), o React não limpa o formulário sozinho:
 * reset() quando o servidor devolve ok.
 */
export function ChangePasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(changeOwnPassword, null);
  const uid = useId();
  const fieldId = (name: FieldName) => `${uid}-${name}`;
  const errId = (name: FieldName) => `${uid}-${name}-err`;

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<ChangePasswordInput, unknown, ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    mode: "onTouched",
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      reset();
      return;
    }
    // Erro que só o servidor sabe (ex.: "Senha atual incorreta."): leva o foco ao campo.
    const first = FIELDS.find((name) => state.fields?.[name]);
    if (first) setFocus(first);
  }, [state, reset, setFocus]);

  // O FormData sai do próprio <form> do evento de envio, que o handleSubmit repassa. Sem ref: ler
  // ref.current numa função entregue ao handleSubmit durante o render quebra a regra react-hooks/refs.
  const onValid = (_values: unknown, event?: BaseSyntheticEvent) => {
    const form: unknown = event?.target;
    if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form);
    startTransition(() => formAction(data));
  };

  const errorOf = (name: FieldName) => errors[name]?.message ?? state?.fields?.[name];
  const serverFieldError = FIELDS.some((name) => state?.fields?.[name]);

  const renderField = (name: FieldName, label: string, autoComplete: "current-password" | "new-password") => {
    const error = errorOf(name);
    return (
      <div className="field">
        <label htmlFor={fieldId(name)} className="field-label">
          {label}
        </label>
        <PasswordInput
          id={fieldId(name)}
          autoComplete={autoComplete}
          required
          maxLength={PASSWORD_MAX}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId(name) : undefined}
          {...register(name)}
        />
        {error ? (
          <span id={errId(name)} className="field-error">
            {error}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <form action={formAction} onSubmit={handleSubmit(onValid)} noValidate className="af">
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <fieldset disabled={pending} className="af-fields">
        <div className="stack" style={{ gap: "0.75rem" }}>
          {renderField("currentPassword", "Senha atual", "current-password")}
          {renderField("newPassword", `Nova senha (mín. ${PASSWORD_MIN} caracteres)`, "new-password")}
          {renderField("confirmPassword", "Confirmar nova senha", "new-password")}
        </div>
        <div className="actions tight">
          <button type="submit" className="btn btn-ghost">
            {pending ? "Alterando…" : "Alterar senha"}
          </button>
        </div>
      </fieldset>
      {state && (state.ok || !serverFieldError) ? (
        <div className={`af-result ${state.ok ? "is-ok" : "is-err"}`} role={state.ok ? "status" : "alert"}>
          {state.message}
        </div>
      ) : null}
    </form>
  );
}
