"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { preload } from "react-dom";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { galleryImageSrcSet, galleryVideoPhotography, includedPhotography, overviewPhotography, productGalleryScenes } from "@/lib/site/product-photography";
import { HeroBuyPanel } from "./HeroBuyPanel";
import { GalleryPhotoCallout } from "./GalleryPhotoCallout";
import { useSelection } from "./SelectionProvider";

const gallerySizes = "(max-width: 900px) calc(100vw - 28px), (max-width: 1328px) 44vw, 562px";

export function Hero() {
  const { color } = useSelection();
  const [photo, setPhoto] = useState(0);
  const [galleryReady, setGalleryReady] = useState(false);
  const touchX = useRef<number | null>(null);
  const userTouched = useRef(false);
  const totalPhotos = productGalleryScenes.length + 3;
  const choose = (index: number) => { userTouched.current = true; setPhoto(index); };
  const move = (direction: number) => { userTouched.current = true; setPhoto((current) => (current + direction + totalPhotos) % totalPhotos); };
  // 2 s depois de entrar, a galeria vai sozinha para o card do video (indice 1) e fica nele; se o visitante ja
  // mexeu na galeria antes disso, nao muda nada (pedido do dono, 2026-10-10).
  useEffect(() => {
    const timer = window.setTimeout(() => { if (!userTouched.current) setPhoto(1); }, 2000);
    return () => window.clearTimeout(timer);
  }, []);
  const packPhoto = includedPhotography(color);
  const photos = [overviewPhotography, galleryVideoPhotography, { ...packPhoto, label: "O que vem", caption: "Lançador · Tambor · Visor · Bateria · Cabo USB" }, ...productGalleryScenes];
  const currentPhoto = photos[photo] ?? photos[0];
  const videoSrc = "videoSrc" in currentPhoto && typeof currentPhoto.videoSrc === "string" ? currentPhoto.videoSrc : undefined;
  const calloutPhoto = photo > 1 ? photo - 1 : 0;
  // A descoberta da primeira foto não depende da hidratação nem do contato da loja.
  preload(overviewPhotography.src, { as: "image", imageSrcSet: galleryImageSrcSet(overviewPhotography.src), imageSizes: gallerySizes, fetchPriority: "high" });
  return (
    <section id="inicio" className="summer-hero" aria-labelledby="hero-title">
      <div className="summer-product container">
        <div className="summer-gallery" aria-label="Galeria do AquaBlast">
          <div className={`summer-photo${photo === 0 ? " summer-photo-overview" : ""}${videoSrc ? " summer-photo-video" : ""}`} style={{ aspectRatio: `${currentPhoto.width} / ${currentPhoto.height}`, "--photo-ratio": currentPhoto.width / currentPhoto.height } as CSSProperties} tabIndex={0} role="group" aria-label="Galeria do produto; use as setas para navegar" aria-describedby={calloutPhoto > 0 ? "gallery-photo-description" : undefined}
            onKeyDown={(event) => { if ((event.target as HTMLElement).closest("video")) return; if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); } }}
            onTouchStart={(event) => { touchX.current = (event.target as HTMLElement).closest("video") ? null : event.touches[0].clientX; }}
            onTouchEnd={(event) => { if (touchX.current !== null) { const delta = event.changedTouches[0].clientX - touchX.current; if (Math.abs(delta) > 45) move(delta < 0 ? 1 : -1); } touchX.current = null; }}>
            {videoSrc ? (
              <div className="summer-video-frame">
              <Image src="/media/premium-v2/video-moldura-praia.webp" alt="Lançador de água elétrico — moldura de praia" fill sizes={gallerySizes} />
              <video className="summer-gallery-video" src={videoSrc} poster={currentPhoto.src} width={720} height={1280} controls playsInline autoPlay muted preload="none" aria-label="Vídeo de demonstração do AquaBlast">
                Seu navegador não suporta a reprodução de vídeo.
              </video>
              </div>
            ) : <picture>
              <source type="image/webp" srcSet={galleryImageSrcSet(currentPhoto.src)} sizes={gallerySizes} />
              <Image key={currentPhoto.src} className="summer-scene" src={currentPhoto.src} alt={currentPhoto.alt} fill unoptimized placeholder="blur" blurDataURL={currentPhoto.blurDataURL} loading="eager" fetchPriority={photo === 0 ? "high" : "auto"} onLoad={() => setGalleryReady(true)} />
            </picture>}
            {!videoSrc && <GalleryPhotoCallout photo={calloutPhoto} />}
            <button type="button" className="summer-gallery-prev" onClick={() => move(-1)} aria-label="Foto anterior"><ChevronLeft size={19} /></button>
            <button type="button" className="summer-gallery-next" onClick={() => move(1)} aria-label="Próxima foto"><ChevronRight size={19} /></button>
            <span className="summer-photo-count" aria-live="polite">{photo + 1}/{totalPhotos}</span>
          </div>
          <div className="summer-thumbs" role="group" aria-label="Fotos do produto">
            {photos.map((item, index) => <button type="button" key={item.src} aria-label={index === 2 ? "Ver produto e acessórios" : "Ver " + item.label} aria-pressed={photo === index} onClick={() => choose(index)}>
              {"videoSrc" in item ? <div className="summer-video-thumb">
                <Image src="/media/premium-v2/video-moldura-praia.webp" alt="" fill sizes="100px" />
                <Image className="summer-video-thumb-poster" src={item.thumbSrc} alt="" fill sizes="50px" unoptimized />
              </div> : <Image src={galleryReady ? item.thumbSrc : item.blurDataURL} alt="" width={item.width} height={item.height} unoptimized loading="lazy" fetchPriority="low" />}
              <span>{"videoSrc" in item && <Play size={10} fill="currentColor" aria-hidden="true" />} {item.label}</span>
            </button>)}
          </div>
        </div>
        <HeroBuyPanel onSelectionChange={() => setPhoto(2)} />
      </div>
    </section>
  );
}
