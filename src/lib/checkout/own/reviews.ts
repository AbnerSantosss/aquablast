import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { checkoutReviewImages, checkoutReviews, DEFAULT_COMPANY_ID } from "@/db/schema";
import type { CheckoutReview, CheckoutReviewImage } from "@/components/checkout/CheckoutReviews";

/** Quantos comentários o checkout mostra no máximo (os primeiros ativos, pela ordem do painel). */
export const CHECKOUT_REVIEWS_LIMIT = 6;
export const REVIEW_AUTHOR_MAX = 60;
export const REVIEW_COMMENT_MAX = 400;

export function reviewImageUrl(imageId: string): string {
  return `/api/checkout/review-image/${imageId}`;
}

/** Letra do círculo ao lado do nome: a primeira do autor, em maiúscula. */
export function reviewAvatar(author: string): string {
  const first = Array.from(author.trim())[0] ?? "";
  return first.toLocaleUpperCase("pt-BR");
}

type ImageRow = { id: string; reviewId: string; width: number; height: number };

/** Fotos (sem os bytes) dos comentários pedidos, já na ordem de exibição. */
async function imagesOf(reviewIds: string[]): Promise<ImageRow[]> {
  if (!reviewIds.length) return [];
  return db
    .select({ id: checkoutReviewImages.id, reviewId: checkoutReviewImages.reviewId, width: checkoutReviewImages.width, height: checkoutReviewImages.height })
    .from(checkoutReviewImages)
    .where(inArray(checkoutReviewImages.reviewId, reviewIds))
    .orderBy(asc(checkoutReviewImages.position), asc(checkoutReviewImages.createdAt));
}

function toImages(rows: ImageRow[], reviewId: string, author: string): CheckoutReviewImage[] {
  return rows
    .filter((row) => row.reviewId === reviewId)
    .map((row) => ({ id: row.id, url: reviewImageUrl(row.id), width: row.width, height: row.height, alt: `Foto enviada por ${author}` }));
}

/** O que o checkout mostra: só ativos, pela ordem do painel, no máximo 6. Sem fallback. */
export async function listActiveCheckoutReviews(companyId: string = DEFAULT_COMPANY_ID): Promise<CheckoutReview[]> {
  const rows = await db
    .select({ id: checkoutReviews.id, author: checkoutReviews.author, score: checkoutReviews.score, comment: checkoutReviews.comment })
    .from(checkoutReviews)
    .where(and(eq(checkoutReviews.companyId, companyId), eq(checkoutReviews.active, true)))
    .orderBy(asc(checkoutReviews.position), asc(checkoutReviews.createdAt))
    .limit(CHECKOUT_REVIEWS_LIMIT);
  const images = await imagesOf(rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    score: Math.max(1, Math.min(5, row.score)),
    author: row.author,
    avatar: reviewAvatar(row.author),
    comment: row.comment,
    images: toImages(images, row.id, row.author),
  }));
}

export interface AdminCheckoutReview extends CheckoutReview {
  active: boolean;
  position: number;
}

/** Lista do painel: todos, ativos ou não, pela ordem. */
export async function listAdminCheckoutReviews(companyId: string = DEFAULT_COMPANY_ID): Promise<AdminCheckoutReview[]> {
  const rows = await db.select().from(checkoutReviews).where(eq(checkoutReviews.companyId, companyId)).orderBy(asc(checkoutReviews.position), asc(checkoutReviews.createdAt));
  const images = await imagesOf(rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    score: Math.max(1, Math.min(5, row.score)),
    author: row.author,
    avatar: reviewAvatar(row.author),
    comment: row.comment,
    images: toImages(images, row.id, row.author),
    active: row.active,
    position: row.position,
  }));
}
