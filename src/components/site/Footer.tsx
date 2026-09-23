/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { Brand } from "./Brand";

export function Footer() {
  return (
    <footer id="contato">
      <div className="container footer-grid">
        <div>
          <Brand />
          <p>
            Mais brincadeira.
            <br />
            Mais presença. Mais infância.
          </p>
        </div>
        <div>
          <h3>Explore</h3>
          <a href="#diversao">A diversão</a>
          <a href="#familia">Por que presentear</a>
          <a href="#ofertas">Escolha o seu</a>
        </div>
        <div>
          <h3>Podemos ajudar?</h3>
          <a href="#duvidas">Perguntas frequentes</a>
          <a href="#duvidas">Entrega e uso do produto</a>
          <Link href="/rastrear">Rastrear pedido</Link>
          <a href="mailto:contato@aquablast.com.br">contato@aquablast.com.br</a>
        </div>
        <div className="footer-contact">
          <span className="icon-box">
            <img className="icon" src="/icons/headphones.svg" alt="" />
          </span>
          <h3>
            Gente de verdade
            <br />
            para conversar com você.
          </h3>
          <a href="mailto:contato@aquablast.com.br" className="text-link">
            Fale com a AquaBlast <img className="icon" src="/icons/arrow-right.svg" alt="" />
          </a>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© 2026 AquaBlast. Todos os direitos reservados.</span>
        <span>Diversão que aproxima.</span>
      </div>
    </footer>
  );
}
