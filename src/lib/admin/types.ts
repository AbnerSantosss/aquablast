/** Resultado padrão devolvido pelas Server Actions do painel (consumido por useActionState). */
export type ActionResult = {
  ok: boolean;
  message: string;
  /** Valor exibido uma única vez (ex.: código de acesso recém-gerado). */
  code?: string;
  /** Erros por campo em formulários maiores. */
  fields?: Record<string, string>;
} | null;

export type ActionFn = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

export const ok = (message: string, extra: Partial<NonNullable<ActionResult>> = {}): ActionResult => ({ ok: true, message, ...extra });
export const fail = (message: string, extra: Partial<NonNullable<ActionResult>> = {}): ActionResult => ({ ok: false, message, ...extra });

export const PAGE_SIZE = 25;
