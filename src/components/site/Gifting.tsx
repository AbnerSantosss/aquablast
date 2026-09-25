/* eslint-disable @next/next/no-img-element */

export function Gifting() {
  return (
    <section className="section gifting" id="familia">
      <div className="container gifting-grid">
        <div className="gifting-copy">
          <span className="eyebrow">O PRESENTE É SÓ O COMEÇO</span>
          <h2>
            A surpresa passa.
            <br />
            <em>A lembrança fica.</em>
          </h2>
          <p>
            Primeiro vem o sorriso ao abrir o presente. Depois, os jatos de água, as corridas pelo quintal
            e aquele pedido de “só mais uma vez!”.
          </p>
        </div>
        <img
          className="gifting-photo"
          src="/presente-diversao-familia.webp"
          width={1536}
          height={1024}
          alt="Cena ilustrativa de uma família brincando com AquaBlast no jardim, ao lado de uma caixa de presente aberta"
          loading="lazy"
        />
        <a className="button button-green gift-cta" href="#ofertas">Quero dar diversão de presente</a>
      </div>
    </section>
  );
}
