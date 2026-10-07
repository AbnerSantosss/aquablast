"use client";

import Image from "next/image";
import { useRef, useState, type CSSProperties } from "react";
import { preload } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { galleryImageSrcSet, includedPhotography, kitGalleryPhotography, overviewPhotography, productGalleryScenes } from "@/lib/site/product-photography";
import { HeroBuyPanel } from "./HeroBuyPanel";
import { GalleryPhotoCallout } from "./GalleryPhotoCallout";
import { useSelection } from "./SelectionProvider";

const gallerySizes = "(max-width: 900px) min(calc(100vw - 28px), 360px), (max-width: 1328px) 44vw, 562px";

export function Hero() {
  const { pack, color, kitColors, kitConfirmed } = useSelection();
  const [photo, setPhoto] = useState(0);
  const [packViewed, setPackViewed] = useState(false);
  const [galleryReady, setGalleryReady] = useState(false);
  const touchX = useRef<number | null>(null);
  const pair = pack === "kit";
  const totalPhotos = productGalleryScenes.length + 2;
  const move = (direction: number) => setPhoto((current) => (current + direction + totalPhotos) % totalPhotos);
  const selectedColors = pair ? kitColors : [color];
  const packPhoto = includedPhotography(selectedColors[0]);
  const photos = [pair && (packViewed || kitConfirmed.some(Boolean)) ? kitGalleryPhotography(kitColors) : overviewPhotography, { ...packPhoto, label: "O que vem", caption: "Lançador · Tambor · Visor · Bateria · Cabo USB" }, ...productGalleryScenes];
  const currentPhoto = photos[photo] ?? photos[0];
  // A descoberta da primeira foto não depende da hidratação nem do contato da loja.
  preload(overviewPhotography.src, { as: "image", imageSrcSet: galleryImageSrcSet(overviewPhotography.src), imageSizes: gallerySizes, fetchPriority: "high" });
  return (
    <section id="inicio" className="summer-hero" aria-labelledby="hero-title">
      <div className="summer-product container">
        <div className="summer-gallery" aria-label="Galeria do AquaBlast">
          <div className={`summer-photo${photo === 0 ? " summer-photo-overview" : ""}`} style={{ aspectRatio: `${currentPhoto.width} / ${currentPhoto.height}`, "--photo-ratio": currentPhoto.width / currentPhoto.height } as CSSProperties} tabIndex={0} role="group" aria-label="Foto do produto; use as setas para navegar" aria-describedby={photo > 0 ? "gallery-photo-description" : undefined}
            onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); } }}
            onTouchStart={(event) => { touchX.current = event.touches[0].clientX; }}
            onTouchEnd={(event) => { if (touchX.current !== null) { const delta = event.changedTouches[0].clientX - touchX.current; if (Math.abs(delta) > 45) move(delta < 0 ? 1 : -1); } touchX.current = null; }}>
            <picture>
              <source type="image/webp" srcSet={galleryImageSrcSet(currentPhoto.src)} sizes={gallerySizes} />
              <Image key={currentPhoto.src} className="summer-scene" src={currentPhoto.src} alt={currentPhoto.alt} fill unoptimized placeholder="blur" blurDataURL={currentPhoto.blurDataURL} loading="eager" fetchPriority={photo === 0 ? "high" : "auto"} onLoad={() => setGalleryReady(true)} />
            </picture>
            <GalleryPhotoCallout photo={photo} />
            <button type="button" className="summer-gallery-prev" onClick={() => move(-1)} aria-label="Foto anterior"><ChevronLeft size={19} /></button>
            <button type="button" className="summer-gallery-next" onClick={() => move(1)} aria-label="Próxima foto"><ChevronRight size={19} /></button>
            <span className="summer-photo-count" aria-live="polite">{photo + 1}/{totalPhotos}</span>
          </div>
          <div className="summer-thumbs" role="group" aria-label="Fotos do produto">
            {photos.map((item, index) => <button type="button" key={item.src} aria-label={index === 1 ? "Ver produto e acessórios" : "Ver " + item.label} aria-pressed={photo === index} onClick={() => setPhoto(index)}><Image src={galleryReady ? item.thumbSrc : item.blurDataURL} alt="" width={item.width} height={item.height} unoptimized loading="lazy" fetchPriority="low" /><span>{item.label}</span></button>)}
          </div>
        </div>
        <HeroBuyPanel onSelectionChange={(reason, nextPack) => {
          setPackViewed(true);
          if (reason === "pack") setPhoto(nextPack === "unit" && color !== "azul" ? 1 : 0);
          else setPhoto(pair ? 0 : 1);
        }} />
      </div>
    </section>
  );
}
