import type { SiteVideo } from "@/lib/site/types";

// Cópias sem áudio dos vídeos enviados nas avaliações; os originais são preservados.
// Os autores mantêm a identificação de src/data/reviews.ts, sem inferir nomes.
export const videos: (SiteVideo & { author: string })[] = [
  { id: "cliente-elcio", author: "elciobach722", src: "/videos/cliente-elcio-sem-audio.mp4", poster: "/videos/cliente-elcio-poster.jpg" },
  { id: "cliente-juliana", author: "julianamenezes605", src: "/videos/cliente-juliana-sem-audio.mp4", poster: "/videos/cliente-juliana-poster.jpg" },
  { id: "cliente-mariana", author: "mariamartin856", src: "/videos/cliente-mariana-sem-audio.mp4", poster: "/videos/cliente-mariana-poster.jpg" },
];

export const heroVideo = {
  src: "/videos/video-jato-reservatorio-amplo.mp4",
  poster: "/videos/video-jato-reservatorio-amplo-poster.jpg",
  width: 720,
  height: 1280,
};
