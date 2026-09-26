import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { getActiveAdminSession } from "@/lib/auth/session";
import { firstParam } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

function safeNext(v: string): string {
  return v.startsWith("/admin") && !v.startsWith("/admin/login") && !v.startsWith("//") ? v : "/admin";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(firstParam(sp.next));
  // Sessão conferida no banco: com a só-assinatura, uma sessão revogada (senha trocada/redefinida,
  // admin desativado) mandaria de volta ao painel, que manda de volta ao login (loop).
  if (await getActiveAdminSession()) redirect(next);
  const resetDone = firstParam(sp.redefinida) === "1";
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand" aria-hidden="true">
          <span className="brand-mark">Aqua</span>
          <b>Blast</b>
          <small>painel</small>
        </div>
        <h1>Entrar</h1>
        <p className="lead">Acesso restrito à equipe da loja.</p>
        {resetDone ? (
          <p className="af-result is-ok login-notice" role="status">
            Senha redefinida. Entre com a nova senha.
          </p>
        ) : null}
        <LoginForm next={next} />
        <p className="login-foot">Após 5 tentativas erradas o acesso é bloqueado por 15 minutos.</p>
      </div>
    </div>
  );
}
