"use client";

import { useActionState, type FormEvent, type ReactNode } from "react";
import type { ActionFn } from "@/lib/admin/types";

/**
 * Formulário ligado a uma Server Action que devolve ActionResult.
 * Mostra a mensagem de retorno inline e desabilita os campos enquanto envia.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  inline,
  resultAbove,
}: {
  action: ActionFn;
  children: ReactNode;
  className?: string;
  /** Texto de confirmação (window.confirm) antes de enviar. */
  confirm?: string;
  /** Layout em linha (botão único). */
  inline?: boolean;
  resultAbove?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const onSubmit = confirm
    ? (e: FormEvent<HTMLFormElement>) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }
    : undefined;
  const result = state ? (
    <div className={`af-result ${state.ok ? "is-ok" : "is-err"}`} role="status">
      <span>{state.message}</span>
      {state.code ? <code className="af-code">{state.code}</code> : null}
    </div>
  ) : null;
  return (
    <form action={formAction} onSubmit={onSubmit} className={`af ${inline ? "af-inline" : ""} ${className ?? ""}`} data-pending={pending ? "true" : "false"}>
      {resultAbove ? result : null}
      <fieldset disabled={pending} className="af-fields">
        {children}
      </fieldset>
      {!resultAbove ? result : null}
    </form>
  );
}
