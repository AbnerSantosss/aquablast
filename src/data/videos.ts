import type { SiteVideo } from "@/lib/site/types";

// Espelha public/videos.json (o app.js original buscava esse arquivo em runtime).
export const videos: SiteVideo[] = [
  { id: "em-acao", src: "/videos/video1.mp4", poster: "/videos/video1-poster.jpg" },
  { id: "detalhes", src: "/videos/video2.mp4", poster: "/videos/video2-poster.jpg" },
  { id: "em-familia", src: "/videos/video3.mp4", poster: "/videos/video3-poster.jpg" },
];

export const heroVideo = {
  src: "/videos/video-destaque.mp4",
  poster: "/videos/video-destaque-poster.jpg",
};
