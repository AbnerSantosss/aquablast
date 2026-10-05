import Image from "next/image";

const features = [
  { src: "/produto-azul.webp", alt: "Brinquedo de água elétrico AquaBlast azul", title: "Elétrico automático", text: "Sem bombear: é só apertar para soltar os disparos de água." },
  { src: "/acessorio-cabo.webp", alt: "Cabo USB para recarga", title: "Recarrega no USB", text: "Bateria recarregável para a próxima brincadeira. Siga as orientações de carga do produto." },
  { src: "/efeito-luz.webp", alt: "Detalhe da luz LED do AquaBlast", title: "Acende a luz LED", text: "O efeito luminoso dá outro clima à brincadeira quando escurece." },
];

export function Accessories() {
  return (
    <section className="section summer-features" aria-labelledby="accessories-title" id="diferenciais">
      <div className="container">
        <div className="section-heading">
          <div><span className="eyebrow">POR QUE É DIFERENTE</span><h2 id="accessories-title">É só apertar. <em>E brincar.</em></h2></div>
          <p>Menos esforço, mais diversão ao ar livre.</p>
        </div>
        <div className="summer-features-grid">
          {features.map((item) => (
            <article key={item.src}>
              <div className="summer-feature-image"><Image src={item.src} alt={item.alt} fill sizes="(max-width: 680px) 110px, 300px" /></div>
              <div><h3>{item.title}</h3><p>{item.text}</p></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
