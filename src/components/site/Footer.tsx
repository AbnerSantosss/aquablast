import Image from "next/image";

import Link from "next/link";
import { CONTACT_EMAIL, DELIVERY_PATH, RETURNS_PATH } from "@/lib/site/constants";
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
            Mais verão em família.
          </p>
        </div>
        <div>
          <h3>Explore</h3>
          <a href="#diversao">A diversão</a>
          <a href="#familia">Também é presente</a>
          <a href="#ofertas">Escolha o seu</a>
        </div>
        <div>
          <h3>Podemos ajudar?</h3>
          <a href="#duvidas">Perguntas frequentes</a>
          <Link href={DELIVERY_PATH}>Entrega e frete</Link>
          <Link href="/rastrear">Rastrear pedido</Link>
          <Link href={RETURNS_PATH}>Trocas e devoluções</Link>
          {/* <wbr> depois do @: na coluna estreita do celular o endereço quebra ali, não no meio do domínio. */}
          <a href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL.split("@")[0]}@<wbr />
            {CONTACT_EMAIL.split("@")[1]}
          </a>
          {whatsapp ? (
            <a href={whatsapp.href} target="_blank" rel="noopener noreferrer">
              WhatsApp: {whatsapp.label}
            </a>
          ) : null}
        </div>
        <div className="footer-contact">
          <span className="icon-box">
            <Image className="icon" src="/icons/headphones.svg" alt="" width={24} height={24} />
          </span>
          <h3>
            Gente de verdade
            <br />
            para conversar com você.
          </h3>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-link">
            Fale com a AquaBlast <Image className="icon" src="/icons/arrow-right.svg" alt="" width={24} height={24} />
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
