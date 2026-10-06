"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Truck, PackageCheck, ShieldCheck } from "lucide-react";
import { reviews } from "@/data/reviews";
import { COLOR_KEYS, COLOR_LABELS, KIT_SAVING, PRICES } from "@/lib/site/constants";
import { reviewSummary } from "@/lib/site/reviews-summary";
import { PurchaseLink } from "./PurchaseLink";
import { useSelection } from "./SelectionProvider";

const summary = reviewSummary(reviews);
const photos = [
  { src: "/efeito-luz.webp", label: "Luz LED", alt: "Detalhe da luz LED do AquaBlast" },
  { src: "/familia-brasileira.webp", label: "Em família", alt: "Cena ilustrativa de família brincando com AquaBlast no quintal" },
  { src: "/family-play.webp", label: "No quintal", alt: "Cena ilustrativa de pai e filho brincando no quintal" },
];
const included = [
  { src: "/acessorio-tambor.webp", label: "Tambor", detail: "Reservatório de água" },
  { src: "/acessorio-bateria.webp", label: "Bateria", detail: "Recarregável" },
  { src: "/acessorio-cabo.webp", label: "Cabo USB", detail: "Para recarga" },
];

export function Hero() {
  const { pack, setPack, color, kitColors, chooseColor, selectKitColor } = useSelection();
  const [photo, setPhoto] = useState(0);
  const touchX = useRef<number | null>(null);
  const pair = pack === "kit";
  const price = PRICES[pack];
  const move = (direction: number) => setPhoto((current) => (current + direction + photos.length + 2) % (photos.length + 2));
  const selectedColors = pair ? kitColors : [color];
  return (
    <section id="inicio" className="summer-hero" aria-labelledby="hero-title">
      <div className="summer-product container">
        <div className="summer-gallery" aria-label="Galeria do AquaBlast">
          <div className="summer-photo" tabIndex={0} role="group" aria-label="Foto do produto; use as setas para navegar"
            onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); } }}
            onTouchStart={(event) => { touchX.current = event.touches[0].clientX; }}
            onTouchEnd={(event) => { if (touchX.current !== null) { const delta = event.changedTouches[0].clientX - touchX.current; if (Math.abs(delta) > 45) move(delta < 0 ? 1 : -1); } touchX.current = null; }}>
            {photo < 2 ? <div className={photo === 0 ? "summer-pack-view with-accessories" : "summer-pack-view"}>
              <div className="summer-pack-caption"><strong>{pair ? "Kit com 2 AquaBlast" : "1 AquaBlast"}</strong><span>{selectedColors.map((selected) => COLOR_LABELS[selected]).join(" + ")}</span></div>
              <div className={pair ? "summer-products is-pair" : "summer-products"}>
                {selectedColors.map((selected, index) => <Image key={index} src={"/produto-" + selected + ".webp"} alt={"AquaBlast " + COLOR_LABELS[selected]} width={900} height={900} sizes="(max-width: 680px) 240px, (max-width: 900px) 320px, 560px" loading="eager" fetchPriority={index === 0 ? "high" : "auto"} />)}
              </div>
              {photo === 0 && <div className="summer-included">
                <p>O que acompanha cada AquaBlast</p>
                <div className="summer-included-items">{included.map((item) => <figure key={item.src}><Image src={item.src} alt={item.label + " — " + item.detail} width={160} height={120} sizes="(max-width: 680px) 80px, 120px" /><figcaption><strong>{item.label}</strong><span>{item.detail}</span></figcaption></figure>)}</div>
                <small>Tambor exibido separado para mostrar o detalhe.</small>
              </div>}
            </div> : <Image className="summer-scene" src={photos[photo - 2].src} alt={photos[photo - 2].alt} width={1000} height={800} sizes="(max-width: 680px) 390px, 650px" />}
            <button type="button" className="summer-gallery-prev" onClick={() => move(-1)} aria-label="Foto anterior"><ChevronLeft size={19} /></button>
            <button type="button" className="summer-gallery-next" onClick={() => move(1)} aria-label="Próxima foto"><ChevronRight size={19} /></button>
            <span className="summer-photo-count" aria-live="polite">{photo + 1}/{photos.length + 2}</span>
            {photo >= 3 && <p className="summer-photo-caption">Imagem ilustrativa.</p>}
          </div>
          <div className="summer-thumbs" role="group" aria-label="Fotos do produto">
            <button type="button" aria-label="Ver produto e acessórios" aria-pressed={photo === 0} onClick={() => setPhoto(0)}><div className="summer-thumb-complete"><Image src={"/produto-" + selectedColors[0] + ".webp"} alt="" width={60} height={60} /><Image src="/acessorio-bateria.webp" alt="" width={30} height={30} /></div><span>O que vem</span></button>
            <button type="button" aria-label="Ver produto escolhido" aria-pressed={photo === 1} onClick={() => setPhoto(1)}><div className="summer-thumb-products">{selectedColors.map((selected, index) => <Image key={index} src={"/produto-" + selected + ".webp"} alt="" width={60} height={60} />)}</div><span>{pair ? "Kit com 2" : "1 unidade"}</span></button>
            {photos.map((item, index) => <button type="button" key={item.src} aria-label={"Ver " + item.label} aria-pressed={photo === index + 2} onClick={() => setPhoto(index + 2)}><Image src={item.src} alt="" width={60} height={60} /><span>{item.label}</span></button>)}
          </div>
        </div>
        <div className="summer-buy desktop-product-panel mobile-top-buy">
          <span className="summer-eyebrow">AQUABLAST · OFERTA DE VERÃO</span>
          <h1 id="hero-title">O brinquedo de água que ganha qualquer guerra no quintal.</h1>
          <p className="summer-description">Lançador de água elétrico com luz LED e recarga USB. É só apertar.</p>
          <a className="summer-rating" href="#avaliacoes"><span aria-hidden="true">★★★★★</span><strong data-hero-review-average>{summary.averageText}</strong><span data-hero-review-count>{summary.countText}</span></a>
          <div className="summer-price" aria-live="polite"><Image src="/icons/pix.svg" alt="Pix" width={25} height={25} /><strong>{price.pix}</strong><span>à vista no Pix</span><small>ou 12x de {price.installment} sem juros</small></div>
          <div className="summer-packs" role="group" aria-label="Escolha a quantidade de AquaBlast">
            <button type="button" aria-pressed={!pair} onClick={() => { setPack("unit"); setPhoto(0); }}><strong>1 unidade</strong><span>{PRICES.unit.pix} no Pix</span></button>
            <button type="button" className="summer-pack-kit" aria-pressed={pair} onClick={() => { setPack("kit"); setPhoto(0); }}><em className="summer-saving-tag">Economize {KIT_SAVING}</em><strong>Kit com 2</strong><span>{PRICES.kit.pix} no Pix</span></button>
          </div>
          <div className="summer-colors">
            {selectedColors.map((selected, index) => <div className="summer-color-row" key={index} role="group" aria-label={pair ? "Cor do " + (index + 1) + "º AquaBlast no topo" : "Cor do AquaBlast no topo"}>
              <span>{pair ? (index + 1) + "º" : "Cor"}</span>
              {COLOR_KEYS.map((option) => <button key={option} type="button" data-color={option} aria-label={COLOR_LABELS[option]} aria-pressed={selected === option} onClick={() => { if (pair) selectKitColor(index as 0 | 1, option); else chooseColor(option); setPhoto(0); }}><Image src={"/thumbs/produto-" + option + "-110.webp"} alt="" width={60} height={60} sizes="48px" /><span>{COLOR_LABELS[option]}</span></button>)}
            </div>)}
          </div>
          <PurchaseLink direct pack={pack} className="button button-green summer-buy-button">{pair ? "Quero meu kit de verão" : "Quero o meu"}</PurchaseLink>
          <div className="summer-trust"><span><Truck size={16} />Frete grátis</span><a href="/rastrear"><PackageCheck size={16} />Rastreio no site</a><a href="/trocas-e-devolucoes"><ShieldCheck size={16} />Troca se chegar quebrado</a></div>
        </div>
      </div>
    </section>
  );
}
