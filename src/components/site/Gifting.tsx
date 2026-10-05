import Image from "next/image";

export function Gifting() {
  return (
    <section className="section summer-gifting" id="familia">
      <div className="container summer-gifting-grid">
        <div>
          <span className="eyebrow">TAMBÉM É PRESENTE</span>
          <h2>Um presente que <em>vira brincadeira.</em></h2>
          <p>No aniversário ou no Natal, dê um motivo para reunir a família no quintal. Com o kit, você entra na diversão também.</p>
          <a className="text-link" href="#ofertas">Escolher meu AquaBlast →</a>
        </div>
        <figure>
          <Image src="/family-play.webp" alt="Cena ilustrativa de pai e filho brincando no quintal" width={1536} height={1024} sizes="(max-width: 680px) 90vw, 480px" />
          <figcaption>Imagem ilustrativa.</figcaption>
        </figure>
      </div>
    </section>
  );
}
