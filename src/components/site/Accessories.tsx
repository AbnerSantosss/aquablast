"use client";

import Image from "next/image";
import { useState } from "react";
import { Play, Pause } from "lucide-react";

export function Accessories() {
  const [showLed, setShowLed] = useState(false);
  return (
    <section className="section summer-features" aria-labelledby="accessories-title" id="diferenciais">
      <div className="container">
        <div className="section-heading">
          <div><span className="eyebrow">CONHEÇA SEU AQUABLAST</span><h2 id="accessories-title">Cada detalhe <em>faz a brincadeira.</em></h2></div>
          <p>Veja o que acompanha o brinquedo e como funciona.</p>
        </div>
        <div className="summer-features-grid summer-details-grid">
          <article>
            <div className="summer-detail-art battery-detail">
              <Image className="detail-toy" src="/produto-azul.webp" alt="AquaBlast elétrico azul" fill sizes="(max-width: 680px) 65vw, 260px" />
              <Image className="detail-battery" src="/acessorio-bateria.webp" alt="Bateria recarregável que acompanha o brinquedo" fill sizes="(max-width: 680px) 32vw, 140px" />
              <Image className="detail-usb" src="/acessorio-cabo.webp" alt="Cabo USB para recarregar a bateria" fill sizes="90px" />
              <span className="detail-art-label">Bateria + cabo USB</span>
            </div>
            <div><span className="summer-detail-kicker">ELÉTRICO E RECARREGÁVEL</span><h3>Aperte. A diversão começa.</h3><p>A bateria alimenta os disparos sequenciais de água, sem precisar bombear. Depois, é só recarregar com o cabo USB.</p></div>
          </article>
          <article>
            <div className="summer-detail-art drum-detail">
              <Image src="/acessorio-tambor.webp" alt="Detalhe do tambor de água que acompanha cada AquaBlast" fill sizes="(max-width: 680px) 75vw, 330px" />
              <span className="detail-art-label">Tambor de água incluso</span>
            </div>
            <div><span className="summer-detail-kicker">RESERVATÓRIO EM TAMBOR</span><h3>Abasteça para brincar.</h3><p>O tambor guarda a água dos disparos e se encaixa no brinquedo. Cada AquaBlast acompanha seu reservatório.</p></div>
          </article>
          <article>
            <div className={"summer-detail-art led-detail" + (showLed ? " is-playing" : "")}>
              {showLed ? <Image src="/demonstracao-led.webp" alt="Demonstração dos disparos com efeito de luz na ponta do brinquedo" fill unoptimized sizes="(max-width: 680px) 100vw, 380px" /> : <Image src="/efeito-luz.webp" alt="Close do efeito de luz LED amarela na ponta do AquaBlast" fill sizes="(max-width: 680px) 100vw, 500px" />}
              <button type="button" onClick={() => setShowLed(!showLed)} aria-pressed={showLed}>{showLed ? <Pause size={16} /> : <Play size={16} />}{showLed ? "Parar demonstração" : "Ver luz em ação"}</button>
            </div>
            <div><span className="summer-detail-kicker">EFEITO LUMINOSO</span><h3>A luz entra na brincadeira.</h3><p>O LED amarelo na ponta acompanha os disparos. Toque em “Ver luz em ação” para assistir à demonstração.</p></div>
          </article>
        </div>
      </div>
    </section>
  );
}
