/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { CONTACT_EMAIL, RETURNS_PATH } from "@/lib/site/constants";
import type { SupportWhatsapp } from "@/lib/site/support-contact";
import { Brand } from "./Brand";

/** `whatsapp` vem do painel (getSupportWhatsapp); null = nenhum WhatsApp no rodapé. */
export function Footer({ whatsapp = null }: { whatsapp?: SupportWhatsapp | null }) {
  return (
    <footer id="contato">
      <div className="container footer-grid">
        <div>
          <Brand lazy />
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
          <Link href={RETURNS_PATH}>Trocas e devoluções</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {whatsapp ? (
            <a href={whatsapp.href} target="_blank" rel="noopener noreferrer">
              WhatsApp: {whatsapp.label}
            </a>
          ) : null}
        </div>
        <div className="footer-contact">
          <span className="icon-box">
            <img className="icon" src="/icons/headphones.svg" alt="" loading="lazy" decoding="async" />
          </span>
          <h3>
            Gente de verdade
            <br />
            para conversar com você.
          </h3>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-link">
            Fale com a AquaBlast <img className="icon" src="/icons/arrow-right.svg" alt="" loading="lazy" decoding="async" />
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
