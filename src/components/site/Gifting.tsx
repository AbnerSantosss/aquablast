/* eslint-disable @next/next/no-img-element */

export function Gifting() {
  return (
    <section className="section gifting" id="familia">
      <div className="container gifting-grid">
        <div>
          <span className="eyebrow">O CARINHO PODE VIR DE QUALQUER PESSOA</span>
          <h2>
            “Lembrei de você.”
            <br />
            <em>É isso que um presente diz.</em>
          </h2>
          <p>
            De mãe para filho. De avô para neto. De tia para sobrinho. AquaBlast é um convite para estar perto e
            transformar uma tarde comum em uma lembrança especial.
          </p>
          <a className="button button-green gift-cta" href="#ofertas">
            <span className="gift-cta-label-mobile">Quero presentear alguém especial</span>
            <span className="gift-cta-label-desktop">Quero dar esse presente</span>
            <img className="icon" src="/icons/arrow-right.svg" alt="" />
          </a>
        </div>
        <img
          className="gifting-photo"
          src="/avo-presente.webp"
          alt="Avô brasileiro entregando o AquaBlast vermelho de presente ao neto"
          loading="lazy"
        />
      </div>
    </section>
  );
}
