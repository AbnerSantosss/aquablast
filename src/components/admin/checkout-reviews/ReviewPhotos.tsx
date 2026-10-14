"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { formatBytes, REVIEW_IMAGE_MAX_BYTES, REVIEW_IMAGES_PER_REVIEW } from "@/lib/checkout/own/reviews-image";

export interface AdminReviewPhoto {
  id: string;
  /** Rota do painel (com sessão): mostra também foto de comentário desativado. */
  url: string;
  width: number;
  height: number;
}

type Status = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "ok"; text: string } | { kind: "err"; text: string };
type Pending = { blob: Blob; url: string; width: number; height: number };

/** Lado maior da foto depois de reduzida no navegador. */
const MAX_SIDE = 1200;
const QUALITY = 0.82;
const NOT_A_PHOTO = "Esse arquivo não é uma foto JPEG, PNG ou WebP. Escolha uma foto nesses formatos.";
const NO_CANVAS = "O navegador não conseguiu preparar a foto. Tente de novo ou use outro navegador.";

/**
 * Reduz a foto no navegador com <canvas>: no máximo 1200 px no lado maior, JPEG com qualidade 0,82.
 * Redesenhar no canvas também joga fora os metadados (EXIF: local, aparelho, data).
 */
async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(NOT_A_PHOTO);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(NO_CANVAS);
  // JPEG não tem transparência: fundo branco para PNG/WebP recortado não sair preto.
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error(NO_CANVAS);
  return { blob, width, height };
}

async function errorOf(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  } catch {
    // Resposta sem JSON (queda de rede, proxy): cai na mensagem padrão.
  }
  return fallback;
}

/** Fotos de um comentário do checkout: lista, envio (com prévia) e remoção. Até 3 por comentário. */
export function ReviewPhotos({ reviewId, author, photos }: { reviewId: string; author: string; photos: AdminReviewPhoto[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "busy";
  const full = photos.length >= REVIEW_IMAGES_PER_REVIEW;

  // Libera a prévia (URL de blob) quando ela é trocada ou a tela fecha.
  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.url);
  }, [pending]);

  const clearPending = () => {
    setPending(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPending(null);
    setStatus({ kind: "busy", text: "Preparando a foto..." });
    try {
      const { blob, width, height } = await shrink(file);
      if (blob.size > REVIEW_IMAGE_MAX_BYTES) {
        throw new Error(`A foto tem ${formatBytes(blob.size)}; o limite é 2 MB. Escolha uma foto menor.`);
      }
      setPending({ blob, url: URL.createObjectURL(blob), width, height });
      setStatus({ kind: "idle" });
    } catch (err) {
      if (inputRef.current) inputRef.current.value = "";
      setStatus({ kind: "err", text: err instanceof Error ? err.message : NOT_A_PHOTO });
    }
  };

  const upload = async () => {
    if (!pending) return;
    setStatus({ kind: "busy", text: "Enviando a foto..." });
    try {
      const body = new FormData();
      body.append("file", pending.blob, "foto.jpg");
      const response = await fetch(`/api/admin/checkout-reviews/${reviewId}/images`, { method: "POST", body });
      if (!response.ok) {
        setStatus({ kind: "err", text: await errorOf(response, "Não deu para enviar a foto. Confira a internet e tente de novo.") });
        return;
      }
      clearPending();
      setStatus({ kind: "ok", text: "Foto enviada." });
      router.refresh();
    } catch {
      setStatus({ kind: "err", text: "Não deu para enviar a foto. Confira a internet e tente de novo." });
    }
  };

  const remove = async (photoId: string) => {
    if (!window.confirm("Remover esta foto do comentário?")) return;
    setStatus({ kind: "busy", text: "Removendo a foto..." });
    try {
      const response = await fetch(`/api/admin/checkout-reviews/images/${photoId}`, { method: "DELETE" });
      if (!response.ok) {
        setStatus({ kind: "err", text: await errorOf(response, "Não deu para remover a foto. Tente de novo.") });
        return;
      }
      setStatus({ kind: "ok", text: "Foto removida." });
      router.refresh();
    } catch {
      setStatus({ kind: "err", text: "Não deu para remover a foto. Confira a internet e tente de novo." });
    }
  };

  return (
    <div className="cr-photos" data-busy={busy ? "true" : "false"}>
      {photos.length ? (
        <ul className="cr-photo-list">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <span className="cr-thumb cr-thumb-lg">
                <Image src={photo.url} alt={`Foto ${index + 1} enviada por ${author}`} width={96} height={96} unoptimized />
              </span>
              <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => remove(photo.id)} disabled={busy}>
                <Trash2 size={14} aria-hidden="true" /> Remover
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">Este comentário ainda não tem foto.</p>
      )}

      {full ? (
        <p className="small muted">Limite de {REVIEW_IMAGES_PER_REVIEW} fotos atingido. Remova uma para enviar outra.</p>
      ) : (
        <label className="field">
          <span>
            Adicionar foto ({photos.length} de {REVIEW_IMAGES_PER_REVIEW})
          </span>
          <input ref={inputRef} type="file" name="foto" accept="image/jpeg,image/png,image/webp" onChange={onPick} disabled={busy} />
          <span className="hint">JPEG, PNG ou WebP. A foto é reduzida para até 1200 px antes de enviar; o limite é 2 MB.</span>
        </label>
      )}

      {pending ? (
        <div className="cr-pending">
          <span className="cr-thumb cr-thumb-lg">
            <Image src={pending.url} alt="Prévia da foto escolhida" width={96} height={96} unoptimized />
          </span>
          <div>
            <p className="small">
              Prévia: {pending.width} x {pending.height} px, {formatBytes(pending.blob.size)}.
            </p>
            <div className="actions tight">
              <button type="button" className="btn btn-primary btn-sm" onClick={upload} disabled={busy}>
                <ImagePlus size={14} aria-hidden="true" /> Enviar foto
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearPending} disabled={busy}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {status.kind !== "idle" ? (
        <div className={`af-result ${status.kind === "err" ? "is-err" : "is-ok"}`} role="status">
          <span>{status.text}</span>
        </div>
      ) : null}
    </div>
  );
}
