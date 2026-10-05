import { videos } from "@/data/videos";
import { SelectOfferLink } from "./SelectOfferLink";

const slots = [
  { title: "AquaBlast em ação", label: "Vídeo 1: AquaBlast em ação" },
  { title: "Veja de perto", label: "Vídeo 2: detalhes do AquaBlast" },
  { title: "Mais diversão ao ar livre", label: "Vídeo 3: AquaBlast em ação" },
];

/**
 * Seção "A diversão". O app.js buscava videos.json e trocava o placeholder
 * "Vídeo real em breve" pelo vídeo; aqui os vídeos reais já entram renderizados.
 */
export function Moments() {
  return (
    <section className="section moments" id="diversao">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">VEJA EM AÇÃO</span>
            <h2>
              Água, quintal e
              <br />
              <em>todo mundo junto.</em>
            </h2>
          </div>
          <p>Assista ao AquaBlast em ação.</p>
        </div>
        <div className="video-grid">
          {slots.map((slot, index) => {
            const video = videos[index];
            return (
              <article className="video-card" data-video-slot={index} key={video.id}>
                <div className="video-frame">
                  <video controls playsInline preload="none" src={video.src} poster={video.poster} aria-label={slot.label} />
                </div>
                <h3>{slot.title}</h3>
              </article>
            );
          })}
        </div>
        <div className="section-purchase-cta">
          <SelectOfferLink className="button button-green">Quero escolher meu AquaBlast</SelectOfferLink>
        </div>
      </div>
    </section>
  );
}
