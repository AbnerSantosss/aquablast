import Image from "next/image";

import { buildFaq } from "@/data/faq";
import type { SitePrices } from "@/lib/site/prices";

export function Faq({ prices }: { prices: SitePrices }) {
  const faq = buildFaq(prices);
  return (
    <section className="section faq" id="duvidas">
      <div className="container faq-grid">
        <div>
          <span className="eyebrow">ANTES DE BRINCAR</span>
          <h2>
            Ficou com
            <br />
            <em>alguma dúvida?</em>
          </h2>
          <p>Veja os detalhes para escolher com tranquilidade.</p>
          <a className="text-link" href="#contato">
            <Image className="icon" src="/icons/headphones.svg" alt="" width={24} height={24} /> Falar com o atendimento
          </a>
        </div>
        <div className="faq-list">
          {faq.map((item) => (
            <details key={item.question}>
              <summary>
                {item.question}
                <Image className="icon" src="/icons/plus.svg" alt="" width={24} height={24} />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
