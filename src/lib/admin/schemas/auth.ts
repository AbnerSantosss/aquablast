import { z } from "zod";

/**
 * Schemas dos formulários de acesso ao painel, compartilhados entre cliente (react-hook-form +
 * zodResolver, só para antecipar o erro) e servidor (as Server Actions revalidam sempre).
 * Este arquivo vai para o bundle do cliente: nada de import de servidor aqui.
 *
 * Senhas passam por trim() dos dois lados porque o login sempre comparou a senha "aparada"
 * (str() em src/lib/admin/form.ts); gravar uma senha com espaço nas pontas a tornaria impossível de usar.
 */

export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;
/** Validade do link de redefinição (fonte única; src/lib/auth/password-reset.ts reexporta). */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/** Mensagens que a interface pode comparar com `ActionResult.message`. */
export const LOGIN_GENERIC_MESSAGE = "E-mail ou senha inválidos.";
export const TOO_MANY_ATTEMPTS_MESSAGE = "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
export const FORGOT_PASSWORD_SENT_MESSAGE = `Se este e-mail tiver acesso ao painel, enviamos um link para criar uma nova senha. Ele vale por ${PASSWORD_RESET_TTL_MINUTES} minutos.`;
export const RESET_LINK_INVALID_MESSAGE = "Este link é inválido ou expirou. Peça um novo.";
/** Confirmação diferente da nova senha (mesma frase na redefinição e em "Trocar minha senha"). */
export const PASSWORD_MISMATCH_MESSAGE = "As senhas não conferem.";

/**
 * Mesmo padrão de isEmail() (src/lib/admin/form.ts), que é a regra usada ao criar admins.
 * O padrão default do z.email() é mais estrito (recusa, por exemplo, acento antes do @) e poderia
 * trancar fora do login/redefinição uma conta que já existe.
 */
const ADMIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** trim + minúsculas + limite antes de validar o formato (z.email().trim() validaria antes de aparar). */
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(EMAIL_MAX, `O e-mail pode ter no máximo ${EMAIL_MAX} caracteres.`)
  .pipe(z.email({ pattern: ADMIN_EMAIL_PATTERN, error: "Informe um e-mail válido." }));

const newPasswordField = z
  .string()
  .trim()
  .min(PASSWORD_MIN, `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`)
  .max(PASSWORD_MAX, `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`);

/**
 * Login. `remember` é boolean opcional (checkbox do react-hook-form). No servidor o FormData traz
 * "on" quando marcado: a action converte com bool() antes de parsear.
 */
export const loginSchema = z.object({
  email: emailField,
  password: z.string().trim().min(1, "Informe a senha.").max(PASSWORD_MAX, `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`),
  remember: z.boolean().optional(),
});

/** Pedir o link de redefinição. */
export const forgotPasswordSchema = z.object({
  email: emailField,
});

/**
 * Criar a nova senha pelo link. O token viaja num input hidden `token` e é validado à parte
 * pelo servidor (não é campo editável, então fica fora do schema do formulário).
 */
export const resetPasswordSchema = z
  .object({
    password: newPasswordField,
    confirmPassword: z.string().trim().min(1, "Confirme a nova senha."),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: PASSWORD_MISMATCH_MESSAGE });

/** "Trocar minha senha" em Configurações. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().trim().min(1, "Informe a senha atual.").max(PASSWORD_MAX, `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`),
    newPassword: z
      .string()
      .trim()
      .min(PASSWORD_MIN, `A nova senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`)
      .max(PASSWORD_MAX, `A nova senha pode ter no máximo ${PASSWORD_MAX} caracteres.`),
    confirmPassword: z.string().trim().min(1, "Confirme a nova senha."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], message: PASSWORD_MISMATCH_MESSAGE });

export type LoginInput = z.input<typeof loginSchema>;
export type LoginValues = z.output<typeof loginSchema>;
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;
export type ForgotPasswordValues = z.output<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type ResetPasswordValues = z.output<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
export type ChangePasswordValues = z.output<typeof changePasswordSchema>;

/**
 * Primeiro erro de cada campo, no formato de `ActionResult.fields` ({ campo: mensagem }).
 * Erros sem campo (raiz do objeto) ficam em "_form".
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
