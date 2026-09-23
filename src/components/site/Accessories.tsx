/* eslint-disable @next/next/no-img-element */

const accessories = [
  {
    src: "/acessorio-cabo.webp",
    alt: "Cabo USB de carregamento do AquaBlast",
    title: "Cabo USB",
    text: "Recarga USB simples para a próxima aventura.",
  },
  {
    src: "/acessorio-bateria.webp",
    alt: "Bateria recarregável azul com conector",
    title: "Bateria recarregável",
    text: "Recarregue. Prepare-se. Volte a brincar.",
  },
  {
    src: "/acessorio-tambor.webp",
    alt: "Reservatório de água redondo do AquaBlast",
    title: "Tambor de água",
    text: "Abasteça o tambor e entre na brincadeira.",
  },
  {
    src: "/acessorio-visor.webp",
    alt: "Visor de mira transparente do AquaBlast",
    title: "Visor de mira",
    text: "Um toque de aventura em cada detalhe.",
  },
];

export function Accessories() {
  return (
    <section className="accessories-section" aria-labelledby="accessories-title">
      <div className="container">
        <div className="accessories-heading">
          <span className="eyebrow">CONHEÇA OS COMPONENTES</span>
          <h2 id="accessories-title">Cada detalhe faz parte da diversão.</h2>
        </div>
        <div className="accessories-grid">
          {accessories.map((item) => (
            <article key={item.src}>
              <img src={item.src} alt={item.alt} loading="lazy" width={240} height={180} />
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
