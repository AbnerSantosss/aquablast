/* eslint-disable @next/next/no-img-element */

export function Gifting() {
  return (
    <section className="section gifting" id="familia">
      <div className="container gifting-grid">
        <div className="gifting-copy">
          {/* Meta Ads (dono, 27/09): deixar explicito que e um brinquedo lancador de agua. */}
          <span className="eyebrow">BRINQUEDO LANÇADOR DE ÁGUA PARA A FAMÍLIA</span>
          <h2>
            A surpresa passa.
            <br />
            <em>A lembrança fica.</em>
          </h2>
          <p>
            <strong>O AquaBlast é um brinquedo lançador de água</strong>, feito para brincar ao ar livre com a
            família: um presente de Dia das Crianças para filho, neto ou sobrinho. Primeiro vem o sorriso ao abrir o presente. Depois, os jatos de água, as
            corridas pelo quintal e aquele pedido de “só mais uma vez!”.
          </p>
        </div>
        <img
          className="gifting-photo"
          src="/presente-diversao-familia.webp"
          srcSet="/thumbs/presente-diversao-familia-720.webp 720w, /presente-diversao-familia.webp 1536w"
          sizes="(max-width: 42.5rem) calc(100vw - 2.25rem), (max-width: 56.25rem) calc(100vw - 3rem), 36.1rem"
          width={1536}
          height={1024}
          alt="Cena ilustrativa de uma família brincando com o brinquedo lançador de água AquaBlast no jardim, ao lado de uma caixa de presente aberta"
          loading="lazy"
          decoding="async"
        />
        <a className="button button-green gift-cta" href="#ofertas">Quero dar diversão de presente</a>
      </div>
    </section>
  );
}
