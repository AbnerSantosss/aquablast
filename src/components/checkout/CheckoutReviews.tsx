"use client";

import { useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import styles from "./CheckoutReviews.module.css";

/** Foto de um comentário, servida por /api/checkout/review-image/[id]. */
export interface CheckoutReviewImage {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
}

/** Comentário exibido no checkout. Vem do banco (cadastro em /admin/checkout/comentarios). */
export interface CheckoutReview {
  id: string;
  score: number;
  author: string;
  /** Primeira letra do autor, em maiúscula. */
  avatar: string;
  comment: string;
  images: CheckoutReviewImage[];
}

// O servidor envia apenas os relatos ativos (no máximo 6), já com as fotos de cada um.
export function CheckoutReviews({ reviews }: { reviews: CheckoutReview[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const [photo, setPhoto] = useState<CheckoutReviewImage | null>(null);

  if (!reviews.length) return null;

  const openPhoto = (image: CheckoutReviewImage, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    setPhoto(image);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  };

  // Esc, botão "Fechar" e clique fora caem todos aqui (evento close do <dialog>).
  const onClose = () => {
    openerRef.current?.focus({ preventScroll: true });
    openerRef.current = null;
  };

  // O <dialog> não tem padding: clique que acerta o próprio elemento foi no fundo escurecido.
  const onDialogClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) dialogRef.current?.close();
  };

  return <section className="ck-reference-reviews" aria-label="Avaliações de clientes">
    <h4>Quem comprou, conta</h4>
    {/* Autor primeiro: na coluna lateral do computador (desktop-shell.css) ele divide a linha com as estrelas,
        e a ordem de leitura fica igual à visual. */}
    {reviews.map((review) => <figure key={review.id}>
      <figcaption><span aria-hidden="true">{review.avatar}</span>{review.author}</figcaption>
      <div className="ck-review-stars" role="img" aria-label={`${review.score} de 5 estrelas`}>
        {Array.from({ length: review.score }, (_, index) => <Star key={index} size={13} fill="currentColor" aria-hidden="true" />)}
      </div>
      <blockquote>{review.comment}</blockquote>
      {review.images.length ? <div className={styles.photos}>
        {review.images.map((image) => <button key={image.id} type="button" className={styles.thumb} aria-haspopup="dialog" onClick={(event) => openPhoto(image, event.currentTarget)}>
          <Image src={image.url} alt={image.alt} width={56} height={56} sizes="56px" />
        </button>)}
      </div> : null}
    </figure>)}
    <Link href="/#avaliacoes" target="_blank" rel="noopener noreferrer">Ver avaliações do produto</Link>
    <dialog ref={dialogRef} className={styles.viewer} aria-label={photo?.alt} onClose={onClose} onClick={onDialogClick}>
      <div className={styles.viewerBox}>
        {photo ? <Image key={photo.id} className={styles.viewerImage} src={photo.url} alt={photo.alt} width={photo.width} height={photo.height} sizes="(max-width: 900px) 92vw, 860px" /> : null}
        <button type="button" className={styles.close} onClick={() => dialogRef.current?.close()}>Fechar</button>
      </div>
    </dialog>
  </section>;
}
