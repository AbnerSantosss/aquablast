import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/admin/ResetPasswordForm";
import { getPasswordResetTarget } from "@/lib/auth/password-reset";
import { PASSWORD_MIN, PASSWORD_RESET_TTL_MINUTES } from "@/lib/admin/schemas/auth";
import { firstParam } from "@/lib/admin/format";

// O token está na URL: sem indexação e sem Referer para nenhum destino.
export const metadata: Metadata = {
  title: "Criar nova senha",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = firstParam(sp.token);
  // Só consulta: NÃO consome o link (leitores de e-mail abrem links sozinhos). Formato inválido = null sem banco.
  const target = await getPasswordResetTarget(token);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand" aria-hidden="true">
          <span className="brand-mark">Aqua</span>
          <b>Blast</b>
          <small>painel</small>
        </div>
        <h1>Criar nova senha</h1>
        {target ? (
          <>
            <p className="lead">
              Conta: <strong className="login-account">{target.email}</strong>
              <br />
              Escolha uma senha com pelo menos {PASSWORD_MIN} caracteres.
            </p>
            <ResetPasswordForm token={token} email={target.email} />
          </>
        ) : (
          <>
            <p className="af-result is-err login-notice" role="alert">
              Este link é inválido ou expirou.
            </p>
            <p className="lead">
              O link de redefinição vale por {PASSWORD_RESET_TTL_MINUTES} minutos e só pode ser usado uma vez. Peça outro para continuar.
            </p>
            <Link href="/admin/login/esqueci-senha" className="btn btn-primary btn-lg full">
              Pedir um novo link
            </Link>
          </>
        )}
        <p className="login-foot">
          <Link href="/admin/login" className="login-link">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}
