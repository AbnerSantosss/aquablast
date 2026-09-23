"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, type MouseEvent } from "react";
import { reviews } from "@/data/reviews";
import { MOBILE_QUERY } from "@/lib/site/constants";
import { getReviewPage } from "@/lib/site/review-page";
import { countText, reviewSummary } from "@/lib/site/reviews-summary";
import type { Review, ReviewMediaItem } from "@/lib/site/types";
import { useMediaQuery } from "./media-query";
import { useReviewViewer } from "./ReviewViewerProvider";

const summary = reviewSummary(reviews);
const STARS = "★★★★★";

// Como no reviews.js: no desktop, fotos e vídeos dos clientes ficam juntos na primeira página.
const mediaReviews = reviews.filter((review) => review.media);
const textReviews = reviews.filter((review) => !review.media);
const desktopReviews = [...mediaReviews, ...textReviews];
const desktopPageSize = Math.max(4, mediaReviews.length);
const MOBILE_PAGE_SIZE = 4;

function ReviewMediaLink({ review, item, index }: { review: Review; item: ReviewMediaItem; index: number }) {
  const { open } = useReviewViewer();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (typeof HTMLDialogElement === "undefined" || typeof HTMLDialogElement.prototype.showModal !== "function") return;
    event.preventDefault();
    open(review.author, review.media?.items ?? [], index, event.currentTarget);
  };
  return (
    <a
      href={item.href}
      data-review-media={item.kind}
      data-poster={item.poster}
      aria-label={item.ariaLabel}
      onClick={onClick}
    >
      <img
        src={item.image.src}
        alt={item.image.alt}
        width={item.image.width}
        height={item.image.height}
        loading="lazy"
        decoding="async"
      />
      {item.kind === "video" && item.duration ? (
        <span className="review-media-video-label" aria-hidden="true">
          <span>▶</span>
          <span>{item.duration}</span>
        </span>
      ) : null}
    </a>
  );
}

function ReviewArticle({ review, hidden }: { review: Review; hidden: boolean }) {
  return (
    <article
      className="customer-review"
      data-review-score={review.score}
      data-review-date-pending={review.datePending ? "" : undefined}
      aria-labelledby={`${review.id}-name`}
      hidden={hidden}
    >
      <span className="review-avatar" aria-hidden="true">
        {review.avatar}
      </span>
      <div className="review-content">
        <h3 id={`${review.id}-name`} className="review-author">
          {review.author}
        </h3>
        <span className="review-stars" role="img" aria-label={`${review.score} de 5 estrelas`}>
          {STARS.slice(0, review.score)}
        </span>
        {review.meta ? (
          <p className="review-meta">
            <time dateTime={review.meta.datetime}>{review.meta.label}</time>
            {review.meta.variation ? (
              <>
                {" "}
                <span aria-hidden="true">|</span> Variação: {review.meta.variation}
              </>
            ) : null}
          </p>
        ) : null}
        {review.details.length ? (
          <dl className={review.detailsLong ? "review-details review-details-long" : "review-details"}>
            {review.details.map((detail) => (
              <div key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {review.comment ? <p className="review-comment">{review.comment}</p> : null}
        {review.media ? (
          <div className="review-media" role="group" aria-label={review.media.label}>
            {review.media.items.map((item, index) => (
              <ReviewMediaLink key={item.href} review={review} item={item} index={index} />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function Reviews() {
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [paging, setPaging] = useState({ page: 1, mobile: false });
  // Ao trocar de layout a página volta para 1 (listener "change" do original).
  const requestedPage = paging.mobile === mobile ? paging.page : 1;

  const filtered = mobile ? reviews : desktopReviews;
  const state = getReviewPage(filtered.length, requestedPage, mobile ? MOBILE_PAGE_SIZE : desktopPageSize);
  const visible = new Set(filtered.slice(state.start, state.end));
  const pageSummary = filtered.length
    ? `${state.start + 1}–${state.end} de ${countText(filtered.length)} · Página ${state.page} de ${state.pageCount}`
    : "Nenhuma avaliação disponível.";

  const goTo = (page: number) => {
    setPaging({ page, mobile });
    const title = document.querySelector<HTMLElement>("#reviews-title");
    if (!title) return;
    title.focus({ preventScroll: true });
    title.scrollIntoView({ block: "start", behavior: "instant" });
  };

  return (
    <section className="product-reviews" id="avaliacoes" aria-labelledby="reviews-title">
      <div className="reviews-container">
        <h2 id="reviews-title" tabIndex={-1}>
          Veja o que nossos clientes falam
        </h2>
        <div className="reviews-summary">
          <div className="reviews-average">
            <p>
              <strong data-review-average="">{summary.averageText}</strong> <span>de 5</span>
            </p>
            <span
              className="review-stars"
              role="img"
              aria-label={`Média de ${summary.averageText} de 5 estrelas`}
              data-average-stars=""
            >
              {STARS}
            </span>
            <p className="reviews-count" data-reviews-count="">
              {summary.countText}
            </p>
          </div>
          <p className="reviews-intro">Avaliações do produto</p>
        </div>
        <p className="visually-hidden" data-review-results="" role="status" aria-live="polite">
          {pageSummary}
        </p>
        <div className="reviews-list">
          {reviews.map((review) => (
            <ReviewArticle key={review.id} review={review} hidden={!visible.has(review)} />
          ))}
        </div>
        <p className="reviews-empty" hidden={filtered.length > 0}>
          Nenhuma avaliação com esse filtro.
        </p>
        <nav className="reviews-pagination" aria-label="Páginas de avaliações" hidden={!filtered.length}>
          <button
            type="button"
            data-reviews-prev=""
            aria-label="Página anterior de avaliações"
            disabled={state.page === 1}
            onClick={() => goTo(state.page - 1)}
          >
            <img src="/icons/chevron-left.svg" alt="" />
          </button>
          <div className="reviews-page-numbers" data-reviews-pages="">
            {state.numbers.map((number, index) =>
              number === null ? (
                <span key={`gap-${index}`} className="reviews-page-gap" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={number}
                  type="button"
                  data-reviews-page={number}
                  aria-label={`Página ${number} de avaliações`}
                  aria-current={number === state.page ? "page" : undefined}
                  onClick={() => {
                    if (number !== state.page) goTo(number);
                  }}
                >
                  {number}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            data-reviews-next=""
            aria-label="Próxima página de avaliações"
            disabled={state.page === state.pageCount}
            onClick={() => goTo(state.page + 1)}
          >
            <img src="/icons/chevron-right.svg" alt="" />
          </button>
        </nav>
        <p className="reviews-page-summary" data-reviews-page-summary="">
          {pageSummary}
        </p>
      </div>
    </section>
  );
}
