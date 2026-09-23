"use client";

import { useActionState } from "react";
import { login } from "@/lib/admin/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(login, null);
  return (
    <form action={formAction} className="login-form">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>E-mail</span>
        <input type="email" name="email" autoComplete="username" required maxLength={254} placeholder="voce@aquablast.com.br" />
      </label>
      <label className="field">
        <span>Senha</span>
        <input type="password" name="password" autoComplete="current-password" required maxLength={200} />
      </label>
      {state && !state.ok ? (
        <p className="af-result is-err" role="alert">
          {state.message}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-lg full" disabled={pending}>
        {pending ? "Entrando…" : "Entrar no painel"}
      </button>
    </form>
  );
}
