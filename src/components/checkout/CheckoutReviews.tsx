import Link from "next/link";
import { Star } from "lucide-react";
import type { Review } from "@/lib/site/types";

export type CheckoutReview = Pick<Review, "id" | "score" | "author" | "avatar" | "comment">;

// O servidor envia apenas os relatos exibidos, sem o dataset e a mídia da galeria.
export function CheckoutReviews({ reviews }: { reviews: CheckoutReview[] }) {
  if (!reviews.length) return null;
  return <section className="ck-reference-reviews" aria-label="Avaliações de clientes">
    <h4>Quem comprou, conta</h4>
    {reviews.map((review) => <figure key={review.id}>
      <div className="ck-review-stars" role="img" aria-label={`${review.score} de 5 estrelas`}>
        {Array.from({ length: review.score }, (_, index) => <Star key={index} size={13} fill="currentColor" aria-hidden="true" />)}
      </div>
      <blockquote>{review.comment}</blockquote>
      <figcaption><span aria-hidden="true">{review.avatar}</span>{review.author}</figcaption>
    </figure>)}
    <Link href="/#avaliacoes" target="_blank" rel="noopener noreferrer">Ver avaliações do produto</Link>
  </section>;
}
