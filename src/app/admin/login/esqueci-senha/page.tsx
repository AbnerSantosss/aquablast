import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/admin/ForgotPasswordForm";
import { PASSWORD_RESET_TTL_MINUTES } from "@/lib/admin/schemas/auth";

// Sem indexação e sem Referer: a página de redefinir leva o token na URL e o fluxo passa por aqui.
export const metadata: Metadata = {
  title: "Esqueci minha senha",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ForgotPasswordPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand" aria-hidden="true">
          <span className="brand-mark">Aqua</span>
          <b>Blast</b>
          <small>painel</small>
        </div>
        <h1>Esqueci minha senha</h1>
        <p className="lead">
          Informe o e-mail que você usa para entrar no painel. Se ele tiver acesso, você recebe um link para criar uma nova senha, válido por{" "}
          {PASSWORD_RESET_TTL_MINUTES} minutos.
        </p>
        <ForgotPasswordForm />
        <p className="login-foot">
          <Link href="/admin/login" className="login-link">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}
