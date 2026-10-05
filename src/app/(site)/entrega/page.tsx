import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME, DELIVERY_PATH, RETURNS_PATH } from "@/lib/site/constants";
import "@/styles/site/trocas.css";

// Informações permanentes de frete e rastreio, sem promessa de chegada em data comemorativa.
export const revalidate = 300;

const TITLE = `Entrega e frete | ${BRAND_NAME}`;
const DESCRIPTION = "Frete grátis para todo o Brasil. Veja como funciona a entrega do AquaBlast e como acompanhar o pedido.";

// Página de suporte para quem consulta as condições de entrega.
export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: DELIVERY_PATH },
  robots: { index: false, follow: true },
};

/** Gota da marca (mesmo desenho de /icons/droplets.svg, lucide), em SVG inline. */
function BrandMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
      <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />
    </svg>
  );
}

function Brand() {
  return (
    <Link className="tr-brand" href="/">
      <BrandMark />
      <span>
        Aqua<b>Blast</b>
      </span>
    </Link>
  );
}

export default function EntregaPage() {
  return (
    <div className="tr-page">
      <a className="skip" href="#conteudo">
        Pular para o conteúdo
      </a>

      <header className="tr-header">
        <div className="tr-bar">
          <Brand />
          <Link className="tr-cta" href="/#ofertas">
            Ver ofertas
          </Link>
        </div>
      </header>

      <main id="conteudo" className="tr-main">
        <div className="tr-hero">
          <div className="tr-wrap">
            <nav className="tr-crumbs" aria-label="Você está aqui">
              <ol>
                <li>
                  <Link href="/">Início</Link>
                </li>
                <li>
                  <span className="tr-sep" aria-hidden="true">
                    ›
                  </span>
                  <span aria-current="page">Entrega</span>
                </li>
              </ol>
            </nav>
            <h1>Entrega e frete</h1>
            <p className="tr-lead">
              Frete grátis para todo o Brasil. A entrega varia conforme a região. Acompanhe seu pedido pelo site.
            </p>
            <div className="tr-actions">
              <Link className="tr-btn tr-btn-green" href="/#ofertas">
                Ver ofertas
              </Link>
            </div>
          </div>
        </div>

        <div className="tr-wrap tr-body">
          <div className="tr-summary">
            <p className="tr-summary-title">Em resumo</p>
            <ul>
              <li>
                <strong>Frete grátis</strong> para todo o Brasil.
              </li>
              <li>
                <strong>Entrega acompanhada:</strong> consulte as atualizações em Rastrear pedido.
              </li>
              <li>
                <strong>Frete informado antes do pagamento.</strong>
              </li>
            </ul>
          </div>

          <section className="tr-section" aria-labelledby="prazo">
            <h2 id="prazo">Qual é o prazo para o meu endereço</h2>
            <p>
              A entrega varia conforme o endereço. O frete é grátis para todo o Brasil e os dados de entrega ficam
              disponíveis no seu pedido.
            </p>
            <p>Se precisar receber para uma ocasião específica, fale com a loja antes de comprar para consultar a previsão.</p>
          </section>

          <section className="tr-section" aria-labelledby="acompanhar">
            <h2 id="acompanhar">Como acompanhar a entrega</h2>
            <p>
              Use Rastrear pedido com o código de rastreio enviado na confirmação da compra.
            </p>
            <div className="tr-actions">
              <Link className="tr-btn tr-btn-outline" href="/rastrear">
                Rastrear pedido
              </Link>
            </div>
          </section>

          <section className="tr-section" aria-labelledby="problema">
            <h2 id="problema">Se chegar quebrado ou com defeito</h2>
            <p>
              Enviamos outro sem custo para você. Os detalhes estão na{" "}
              <Link href={RETURNS_PATH}>política de trocas e devoluções</Link>.
            </p>
          </section>
        </div>
      </main>

      <footer className="tr-footer">
        <div className="tr-footer-inner">
          <div>
            <Brand />
            <p className="tr-footer-tagline">Diversão que aproxima.</p>
          </div>
          <nav aria-label="Rodapé">
            <ul>
              <li>
                <Link href="/">Voltar para a loja</Link>
              </li>
              <li>
                <Link href="/#ofertas">Ver ofertas</Link>
              </li>
              <li>
                <Link href="/rastrear">Rastrear pedido</Link>
              </li>
              <li>
                <Link href={RETURNS_PATH}>Trocas e devoluções</Link>
              </li>
            </ul>
          </nav>
        </div>
        <p className="tr-footer-bottom">© 2026 AquaBlast. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
