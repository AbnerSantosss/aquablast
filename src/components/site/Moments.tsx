import { videos } from "@/data/videos";
import { SelectOfferLink } from "./SelectOfferLink";

/** Vídeos de clientes já identificados nas avaliações do site. */
export function Moments() {
  return (
    <section className="section moments" id="diversao">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">QUEM COMPROU, MOSTROU</span>
            <h2>
              AquaBlast na prática.
              <br />
              <em>Por quem recebeu.</em>
            </h2>
          </div>
          <p>Vídeos enviados por clientes. Exibição sem áudio.</p>
        </div>
        <div className="video-grid">
          {videos.map((video, index) => {
            const title = `Cliente AquaBlast: ${video.author}`;
            return (
              <article className="video-card" data-video-slot={index} key={video.id}>
                <div className="video-frame">
                  <video controls playsInline preload="none" src={video.src} poster={video.poster} aria-label={`${title}. Vídeo sem áudio.`} />
                </div>
                <h3>{title}</h3>
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
