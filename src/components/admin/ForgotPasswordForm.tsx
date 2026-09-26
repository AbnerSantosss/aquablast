"use client";

import { startTransition, useActionState, useId, type BaseSyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { requestPasswordReset } from "@/lib/admin/actions/auth";
import { EMAIL_MAX, forgotPasswordSchema, type ForgotPasswordInput, type ForgotPasswordValues } from "@/lib/admin/schemas/auth";

/**
 * "Esqueci minha senha": pede o link por e-mail. A resposta do servidor é sempre a mesma
 * (não revela se a conta existe); depois do ok o formulário some e fica só a mensagem.
 * Mesmo padrão do LoginForm: react-hook-form valida no cliente e o FormData vai para a action.
 */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, null);
  const uid = useId();
  const emailId = `${uid}-email`;
  const emailErrId = `${uid}-email-err`;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput, unknown, ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onTouched",
    defaultValues: { email: "" },
  });

  // O FormData sai do próprio <form> do evento de envio, que o handleSubmit repassa. Sem ref: ler
  // ref.current numa função entregue ao handleSubmit durante o render quebra a regra react-hooks/refs.
  const onValid = (_values: unknown, event?: BaseSyntheticEvent) => {
    const form: unknown = event?.target;
    if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form);
    startTransition(() => formAction(data));
  };

  if (state?.ok) {
    return (
      <p className="af-result is-ok login-notice" role="status">
        {state.message}
      </p>
    );
  }

  const emailError = errors.email?.message ?? state?.fields?.email;

  return (
    <form action={formAction} onSubmit={handleSubmit(onValid)} noValidate>
      <fieldset disabled={pending} className="login-form">
        <div className="field">
          <label htmlFor={emailId} className="field-label">
            E-mail
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            maxLength={EMAIL_MAX}
            placeholder="voce@aquablast.com.br"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? emailErrId : undefined}
            {...register("email")}
          />
          {emailError ? (
            <span id={emailErrId} className="field-error">
              {emailError}
            </span>
          ) : null}
        </div>

        {state && !state.ok && !state.fields?.email ? (
          <p className="af-result is-err" role="alert">
            {state.message}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary btn-lg full">
          {pending ? "Enviando…" : "Enviar link"}
        </button>
      </fieldset>
    </form>
  );
}
