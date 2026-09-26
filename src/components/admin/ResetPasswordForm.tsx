"use client";

import { startTransition, useActionState, useId, type BaseSyntheticEvent } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPassword } from "@/lib/admin/actions/auth";
import { PASSWORD_MAX, PASSWORD_MIN, resetPasswordSchema, type ResetPasswordInput, type ResetPasswordValues } from "@/lib/admin/schemas/auth";
import { PasswordInput } from "@/components/admin/PasswordInput";

/**
 * Criar a nova senha pelo link do e-mail. O token vai num input hidden; o `username` oculto
 * (autocomplete="username") faz o gerenciador de senhas associar a senha nova à conta certa
 * (a action ignora esse campo). Sucesso: a action redireciona para /admin/login?redefinida=1.
 */
export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, null);
  const uid = useId();
  const ids = {
    password: `${uid}-password`,
    passwordErr: `${uid}-password-err`,
    confirm: `${uid}-confirm`,
    confirmErr: `${uid}-confirm-err`,
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput, unknown, ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onTouched",
    defaultValues: { password: "", confirmPassword: "" },
  });

  // O FormData sai do próprio <form> do evento de envio, que o handleSubmit repassa. Sem ref: ler
  // ref.current numa função entregue ao handleSubmit durante o render quebra a regra react-hooks/refs.
  const onValid = (_values: unknown, event?: BaseSyntheticEvent) => {
    const form: unknown = event?.target;
    if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form);
    startTransition(() => formAction(data));
  };

  const passwordError = errors.password?.message ?? state?.fields?.password;
  const confirmError = errors.confirmPassword?.message ?? state?.fields?.confirmPassword;
  const serverFieldError = Boolean(state?.fields?.password || state?.fields?.confirmPassword);
  const linkDead = state?.code === "invalid_token";

  return (
    <form action={formAction} onSubmit={handleSubmit(onValid)} noValidate>
      <input type="hidden" name="token" value={token} />
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <fieldset disabled={pending} className="login-form">
        <div className="field">
          <label htmlFor={ids.password} className="field-label">
            Nova senha (mín. {PASSWORD_MIN} caracteres)
          </label>
          <PasswordInput
            id={ids.password}
            autoComplete="new-password"
            required
            maxLength={PASSWORD_MAX}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? ids.passwordErr : undefined}
            {...register("password")}
          />
          {passwordError ? (
            <span id={ids.passwordErr} className="field-error">
              {passwordError}
            </span>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor={ids.confirm} className="field-label">
            Confirmar nova senha
          </label>
          <PasswordInput
            id={ids.confirm}
            autoComplete="new-password"
            required
            maxLength={PASSWORD_MAX}
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? ids.confirmErr : undefined}
            {...register("confirmPassword")}
          />
          {confirmError ? (
            <span id={ids.confirmErr} className="field-error">
              {confirmError}
            </span>
          ) : null}
        </div>

        {state && !state.ok && !serverFieldError ? (
          <div className="af-result is-err" role="alert">
            <span>{state.message}</span>
            {linkDead ? (
              <>
                {" "}
                <Link href="/admin/login/esqueci-senha">Pedir um novo link</Link>
              </>
            ) : null}
          </div>
        ) : null}

        <button type="submit" className="btn btn-primary btn-lg full">
          {pending ? "Salvando…" : "Salvar nova senha"}
        </button>
      </fieldset>
    </form>
  );
}
