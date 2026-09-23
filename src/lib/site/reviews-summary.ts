import type { Review } from "@/lib/site/types";

export interface ReviewSummary {
  count: number;
  average: number;
  /** Média com uma casa decimal em pt-BR (ex.: "4,9"), igual ao reviews.js. */
  averageText: string;
  /** "66 avaliações" / "1 avaliação". */
  countText: string;
}

export const countText = (count: number): string => `${count} ${count === 1 ? "avaliação" : "avaliações"}`;

/** Calculado a partir das avaliações reais — nunca digitado à mão. */
export function reviewSummary(list: Review[]): ReviewSummary {
  const count = list.length;
  const average = count ? list.reduce((total, review) => total + review.score, 0) / count : 0;
  const averageText = average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return { count, average, averageText, countText: countText(count) };
}
