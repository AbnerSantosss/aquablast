export type Color = "azul" | "vermelho" | "preto";
export type Pack = "unit" | "kit";

export interface ReviewDetail {
  label: string;
  value: string;
}

export interface ReviewMeta {
  datetime: string;
  label: string;
  variation?: string;
}

export interface ReviewMediaImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface ReviewMediaItem {
  kind: "image" | "video";
  href: string;
  poster?: string;
  ariaLabel: string;
  image: ReviewMediaImage;
  duration?: string;
}

export interface ReviewMedia {
  label: string;
  items: ReviewMediaItem[];
}

export interface Review {
  id: string;
  score: number;
  datePending: boolean;
  avatar: string;
  author: string;
  meta?: ReviewMeta;
  detailsLong: boolean;
  details: ReviewDetail[];
  comment?: string;
  media?: ReviewMedia;
}

export interface SiteVideo {
  id: string;
  src: string;
  poster: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}
