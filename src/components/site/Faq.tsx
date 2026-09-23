/* eslint-disable @next/next/no-img-element */

import { faq } from "@/data/faq";

export function Faq() {
  return (
    <section className="section faq" id="duvidas">
      <div className="container faq-grid">
        <div>
          <span className="eyebrow">ANTES DA SURPRESA</span>
          <h2>
            Ficou com
            <br />
            <em>alguma dúvida?</em>
          </h2>
          <p>Veja os detalhes para escolher com tranquilidade.</p>
          <a className="text-link" href="#contato">
            <img className="icon" src="/icons/headphones.svg" alt="" /> Falar com o atendimento
          </a>
        </div>
        <div className="faq-list">
          {faq.map((item) => (
            <details key={item.question}>
              <summary>
                {item.question}
                <img className="icon" src="/icons/plus.svg" alt="" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
