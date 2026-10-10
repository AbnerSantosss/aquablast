import type { SiteVideo } from "@/lib/site/types";

// Cópias sem áudio dos vídeos enviados nas avaliações; os originais são preservados.
// Os autores mantêm a identificação de src/data/reviews.ts, sem inferir nomes.
export const videos: (SiteVideo & { author: string })[] = [
  { id: "cliente-elcio", author: "elciobach722", src: "/videos/cliente-elcio-sem-audio.mp4", poster: "/videos/cliente-elcio-poster.jpg" },
  { id: "cliente-juliana", author: "julianamenezes605", src: "/videos/cliente-juliana-sem-audio.mp4", poster: "/videos/cliente-juliana-poster.jpg" },
  { id: "cliente-mariana", author: "mariamartin856", src: "/videos/cliente-mariana-sem-audio.mp4", poster: "/videos/cliente-mariana-poster.jpg" },
];

// Video do card do topo (galeria e card do desktop). Desde 2026-10-10 e o "Best electric water gun ... dublado -
// cards PT" mandado pelo dono (540x960, 19 s, com audio dublado; reencodado em h264 crf 24 + faststart, 2,4 MB).
// O anterior, video-jato-reservatorio-amplo.mp4, continua em public/videos para voltar se for preciso.
export const heroVideo = {
  src: "/videos/video-card-dublado-pt.mp4",
  poster: "/videos/video-card-dublado-pt-poster.jpg",
  width: 540,
  height: 960,
};
