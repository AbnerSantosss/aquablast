import { videos } from "@/data/videos";
import { SelectOfferLink } from "./SelectOfferLink";

const slots = [
  { index: "01 / EM AÇÃO", title: "AquaBlast em ação • 01", label: "Vídeo 1: AquaBlast em ação" },
  { index: "02 / DE PERTO", title: "AquaBlast em ação • 02", label: "Vídeo 2: AquaBlast em ação" },
  { index: "03 / EM FAMÍLIA", title: "AquaBlast em ação • 03", label: "Vídeo 3: AquaBlast em ação" },
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
            <span className="eyebrow">VEJA A DIVERSÃO ACONTECER</span>
            <h2>
              Brincadeira de verdade.
              <br />
              <em>Em cada detalhe.</em>
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
                  <video controls playsInline preload="metadata" src={video.src} poster={video.poster} aria-label={slot.label} />
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
