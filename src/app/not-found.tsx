import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/site/not-found.css";

// O Next responde 404 e injeta <meta name="robots" content="noindex"> sozinho.
// Também é a página do notFound() do painel (/admin), que não tem not-found próprio.
export const metadata: Metadata = {
  title: "Página não encontrada | AquaBlast",
};

export default function NotFound() {
  return (
    <main className="nf-page">
      <div className="nf-card">
        <p className="nf-brand">AquaBlast</p>
        <h1>Página não encontrada</h1>
        <p className="nf-text">O link pode estar errado ou esta página não existe mais.</p>
        <nav className="nf-links" aria-label="Continuar navegando">
          <Link className="nf-btn nf-btn-primary" href="/">
            Voltar para a loja
          </Link>
          <Link className="nf-btn" href="/#ofertas">
            Ver ofertas
          </Link>
          <Link className="nf-btn" href="/rastrear">
            Rastrear pedido
          </Link>
        </nav>
      </div>
    </main>
  );
}
