"use client";

import { startTransition, useActionState, useId, type BaseSyntheticEvent } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { login } from "@/lib/admin/actions/auth";
import { EMAIL_MAX, PASSWORD_MAX, loginSchema, type LoginInput, type LoginValues } from "@/lib/admin/schemas/auth";
import { PasswordInput } from "@/components/admin/PasswordInput";

/**
 * Login do painel. react-hook-form valida no cliente (mesmo schema da action) e, se passar, envia o
 * FormData para a Server Action pelo useActionState. Sem JavaScript o <form action> nativo continua
 * funcionando (a action revalida tudo no servidor).
 * Modo "onTouched": não acusa erro enquanto a pessoa digita pela primeira vez; acusa ao sair do campo
 * e, a partir daí, some assim que o valor fica certo.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(login, null);
  const uid = useId();
  const ids = {
    email: `${uid}-email`,
    emailErr: `${uid}-email-err`,
    password: `${uid}-password`,
    passwordErr: `${uid}-password-err`,
    rememberHint: `${uid}-remember-hint`,
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput, unknown, LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: "onTouched",
    defaultValues: { email: "", password: "", remember: false },
  });

  // O FormData sai do próprio <form> do evento de envio, que o handleSubmit repassa. Sem ref: ler
  // ref.current numa função entregue ao handleSubmit durante o render quebra a regra react-hooks/refs.
  const onValid = (_values: unknown, event?: BaseSyntheticEvent) => {
    const form: unknown = event?.target;
    if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form);
    startTransition(() => formAction(data));
  };

  const emailError = errors.email?.message ?? state?.fields?.email;
  const passwordError = errors.password?.message ?? state?.fields?.password;

  return (
    <form action={formAction} onSubmit={handleSubmit(onValid)} noValidate>
      <input type="hidden" name="next" value={next} />
      <fieldset disabled={pending} className="login-form">
        <div className="field">
          <label htmlFor={ids.email} className="field-label">
            E-mail
          </label>
          <input
            id={ids.email}
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            maxLength={EMAIL_MAX}
            placeholder="voce@aquablast.com.br"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? ids.emailErr : undefined}
            {...register("email")}
          />
          {emailError ? (
            <span id={ids.emailErr} className="field-error">
              {emailError}
            </span>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor={ids.password} className="field-label">
            Senha
          </label>
          <PasswordInput
            id={ids.password}
            autoComplete="current-password"
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

        <div className="login-options">
          <div className="login-remember">
            <label className="check">
              <input type="checkbox" aria-describedby={ids.rememberHint} {...register("remember")} />
              <span>Lembrar de mim</span>
            </label>
            <span id={ids.rememberHint} className="hint">
              Mantém a sessão por 30 dias neste aparelho.
            </span>
          </div>
          <Link href="/admin/login/esqueci-senha" className="login-link">
            Esqueci minha senha
          </Link>
        </div>

        {state && !state.ok ? (
          <p className="af-result is-err" role="alert">
            {state.message}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary btn-lg full">
          {pending ? "Entrando…" : "Entrar no painel"}
        </button>
      </fieldset>
    </form>
  );
}
