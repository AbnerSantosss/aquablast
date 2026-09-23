"use client";

export default function PainelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const unauthorized = error.message === "UNAUTHORIZED";
  return (
    <div className="card error-page">
      <h1>{unauthorized ? "Sessão expirada" : "Algo deu errado"}</h1>
      <p className="muted" style={{ marginTop: "0.5rem" }}>
        {unauthorized ? "Entre novamente para continuar." : "A ação não pôde ser concluída. Tente de novo; se persistir, verifique os logs do servidor."}
      </p>
      {error.digest ? <p className="muted small mono">ref. {error.digest}</p> : null}
      <div className="actions" style={{ justifyContent: "center" }}>
        {unauthorized ? (
          <a className="btn btn-primary" href="/admin/login">
            Entrar
          </a>
        ) : (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Tentar de novo
          </button>
        )}
        <a className="btn btn-ghost" href="/admin">
          Ir para pedidos
        </a>
      </div>
    </div>
  );
}
