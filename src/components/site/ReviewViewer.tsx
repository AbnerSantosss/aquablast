"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useReviewViewer } from "./ReviewViewerProvider";

interface NavState {
  token: number;
  index: number;
  error: boolean;
}

/** Porta do visualizador de fotos/vídeos das avaliações (reviews.js). */
export function ReviewViewer() {
  const { request, clear } = useReviewViewer();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const previousOverflowRef = useRef("");
  const [nav, setNav] = useState<NavState>({ token: 0, index: 0, error: false });

  const items = request?.items ?? [];
  const count = items.length;
  // Estado derivado: uma nova abertura sempre começa no item pedido, sem erro.
  const current: NavState =
    request && nav.token === request.token ? nav : { token: request?.token ?? 0, index: request?.index ?? 0, error: false };
  const index = count ? ((current.index % count) + count) % count : 0;
  const item = count ? items[index] : null;
  const isVideo = item?.kind === "video";

  const showMedia = (next: number) => {
    if (!request) return;
    setNav({ token: request.token, index: ((next % count) + count) % count, error: false });
  };

  // Abertura: pausa outros vídeos, abre o modal, trava o scroll e foca "Fechar".
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !request) return;
    openerRef.current = request.opener;
    if (!dialog.open) {
      previousOverflowRef.current = document.body.style.overflow;
      document.querySelectorAll("video").forEach((other) => other.pause());
      dialog.showModal();
      document.body.style.overflow = "hidden";
      closeRef.current?.focus();
    }
  }, [request]);

  // Cada mídia exibida: vídeo toca sozinho; ao sair do vídeo, ele é descarregado.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !request) return;
    if (item?.kind === "video") {
      video.load();
      video.play().catch(() => {
        // Controles nativos continuam disponíveis.
      });
      return;
    }
    video.pause();
    video.load();
  }, [request, item]);

  // Fechamento (botão, Esc ou clique fora): restaura o scroll e devolve o foco.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.removeAttribute("poster");
        video.load();
      }
      document.body.style.overflow = previousOverflowRef.current;
      openerRef.current?.focus({ preventScroll: true });
      clear();
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [clear]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.target === videoRef.current) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      showMedia(index + (event.key === "ArrowLeft" ? -1 : 1));
    }
  };

  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      dialog.close();
    }
  };

  const onMediaError = () => {
    if (!request || !dialogRef.current?.open) return;
    setNav({ token: request.token, index, error: true });
  };

  const author = request?.author ?? "";
  const imageVisible = Boolean(item) && !isVideo && !current.error;
  const videoVisible = Boolean(item) && isVideo && !current.error;

  return (
    <dialog
      id="review-viewer"
      className="review-viewer"
      aria-labelledby="review-viewer-title"
      aria-describedby="review-viewer-position"
      ref={dialogRef}
      onKeyDown={onKeyDown}
      onClick={onClick}
    >
      <div className="review-viewer-shell">
        <header className="review-viewer-heading">
          <h2 id="review-viewer-title">{request ? `Avaliação de ${author}` : "Fotos da avaliação"}</h2>
          <button type="button" data-review-close="" aria-label="Fechar mídia ampliada" autoFocus ref={closeRef} onClick={() => dialogRef.current?.close()}>
            <img src="/icons/x.svg" alt="" loading="lazy" decoding="async" />
          </button>
        </header>
        <div className="review-viewer-stage">
          <img
            className="review-viewer-image"
            alt={imageVisible && item ? item.image.alt || `Foto enviada por ${author}` : ""}
            src={imageVisible && item ? item.href : undefined}
            hidden={!imageVisible}
            onError={onMediaError}
          />
          <video
            ref={videoRef}
            className="review-viewer-video"
            controls
            playsInline
            preload="metadata"
            aria-label={videoVisible ? `Vídeo enviado por ${author}` : undefined}
            src={videoVisible && item ? item.href : undefined}
            poster={videoVisible && item ? item.poster : undefined}
            hidden={!videoVisible}
            onError={onMediaError}
          />
          <p className="review-media-error" role="status" hidden={!current.error}>
            Não foi possível carregar esta mídia.
          </p>
        </div>
        <footer className="review-viewer-navigation">
          <button type="button" data-review-step="-1" aria-label="Mídia anterior" disabled={Boolean(request) && count < 2} onClick={() => showMedia(index - 1)}>
            <img src="/icons/chevron-left.svg" alt="" loading="lazy" decoding="async" />
          </button>
          <p id="review-viewer-position" aria-live="polite">
            {item ? `${isVideo ? "Vídeo" : "Foto"} ${index + 1} de ${count}` : ""}
          </p>
          <button type="button" data-review-step="1" aria-label="Próxima mídia" disabled={Boolean(request) && count < 2} onClick={() => showMedia(index + 1)}>
            <img src="/icons/chevron-right.svg" alt="" loading="lazy" decoding="async" />
          </button>
        </footer>
      </div>
    </dialog>
  );
}
