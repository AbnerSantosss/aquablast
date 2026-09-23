"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, type ReactNode } from "react";
import { reviews } from "@/data/reviews";
import { CHECKOUT_URL, COLOR_LABELS, HERO_PHOTOS, MOBILE_QUERY, PRICES } from "@/lib/site/constants";
import { reviewSummary } from "@/lib/site/reviews-summary";
import { HeroFeaturedVideo } from "./HeroFeaturedVideo";
import { KitSwatches, UnitSwatches } from "./ColorSwatches";
import { scrollBehavior } from "./media-query";
import { useSelection } from "./SelectionProvider";

const summary = reviewSummary(reviews);

// No HTML original, o painel de produto e o vídeo em destaque ficam DENTRO de .catalog-gallery.
function CatalogGallery({ children }: { children: ReactNode }) {
  const { heroPhoto, heroTouched, videoActive, isCustomKit, kitColors, kitName, kitAlt, selectHeroOption, selectHeroVideo } =
    useSelection();

  const item = HERO_PHOTOS[heroPhoto];
  const pair = heroPhoto === 1 && isCustomKit;
  const frameClass = [
    "catalog-main-photo",
    item.kind === "scene" && "is-scene",
    (item.kind === "art" || item.kind === "campaign") && "is-art",
    item.kind === "campaign" && "is-campaign",
    pair && "is-custom-kit",
  ]
    .filter(Boolean)
    .join(" ");
  const title = heroPhoto === 1 ? kitName : item.title;
  const alt = heroPhoto === 1 ? kitAlt : item.alt;
  const label = heroTouched
    ? title.toUpperCase() + (item.kind === "photo" ? " • FOTO DO PRODUTO" : " • IMAGEM ILUSTRATIVA")
    : "1 UNIDADE AQUABLAST";
  const pressedPhoto = heroPhoto === 1 ? 1 : 0;
  const isPressed = (index: number) => !videoActive && index === pressedPhoto;

  const onVideoThumb = () => {
    selectHeroVideo();
    if (window.matchMedia(MOBILE_QUERY).matches) {
      document.querySelector(".hero-featured-video")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    }
  };

  return (
    <div className={videoActive ? "catalog-gallery desktop-video-active" : "catalog-gallery"}>
      <h1 id="hero-title" className="visually-hidden">
        AquaBlast — Escolha uma unidade ou kit com 2
      </h1>
      <div className="catalog-gift-label mobile-gallery-label">
        <img src="/gift.webp" alt="" width={34} height={34} />
        <span className="hero-gift-copy">
          <strong>“Lembrei de você.”</strong>
          <span>É isso que um presente diz</span>
        </span>
      </div>
      <button
        className={frameClass}
        aria-label={heroPhoto === 1 ? "Escolher kit com 2 AquaBlast e suas cores" : "Escolher 1 unidade AquaBlast e sua cor"}
        onClick={() => selectHeroOption(heroPhoto)}
      >
        <span className="catalog-art-brand" aria-hidden="true">
          Aqua<b>Blast</b>
          <small>DIVERSÃO QUE APROXIMA</small>
        </span>
        <img id="hero-product-photo" src={item.src} alt={alt} width={1254} height={1254} fetchPriority="high" hidden={pair} />
        <span className="catalog-kit-preview" hidden={!pair}>
          <img data-kit-image="0" src={`/produto-${kitColors[0]}.webp`} alt={`AquaBlast ${COLOR_LABELS[kitColors[0]].toLowerCase()}`} />
          <img data-kit-image="1" src={`/produto-${kitColors[1]}.webp`} alt={`AquaBlast ${COLOR_LABELS[kitColors[1]].toLowerCase()}`} />
        </span>
        <span className="catalog-zoom-icon">
          <img className="icon" src="/icons/arrow-up-right.svg" alt="" />
        </span>
        <span className="catalog-photo-label" id="hero-photo-label">
          {label}
        </span>
      </button>
      <h2 className="catalog-choice-title" id="catalog-choice-title">
        Selecione seu kit
      </h2>
      <div className="catalog-thumbnails" role="group" aria-labelledby="catalog-choice-title">
        <button
          className="desktop-video-thumb"
          data-desktop-video=""
          aria-label="Ver vídeo do AquaBlast"
          aria-pressed={videoActive}
          onClick={onVideoThumb}
        >
          <img src="/produto-preto.webp" alt="AquaBlast preto — assistir ao vídeo" />
          <span>▶ Ver vídeo</span>
        </button>
        <button
          className="art-thumb"
          data-hero-photo="0"
          aria-label="Escolher 1 unidade AquaBlast"
          aria-pressed={isPressed(0)}
          onClick={() => selectHeroOption(0)}
        >
          <img src="/campanha-abertura.webp" alt="" />
          <span>1 unidade</span>
        </button>
        <button
          className="art-thumb"
          data-hero-photo="1"
          aria-label="Escolher kit com 2 — arte azul e preto"
          aria-pressed={isPressed(1)}
          onClick={() => selectHeroOption(1)}
        >
          <img className="kit-thumb-art" src="/kit-azul-preto-v40.webp" alt="Arte ilustrativa: AquaBlast azul e preto" />
          <span>Kit com 2</span>
        </button>
      </div>
      {children}
    </div>
  );
}

function DesktopProductPanel() {
  const { pack, color, colorTouched, selectPack } = useSelection();
  const price = PRICES[pack];
  const unitAlt = colorTouched ? `AquaBlast ${COLOR_LABELS[color].toLowerCase()}` : "";

  return (
    <div className="desktop-product-panel" aria-labelledby="desktop-product-title">
      <div className="desktop-product-heading">
        <h2 id="desktop-product-title">Pistola de água elétrica com efeito luminoso</h2>
      </div>
      <a
        className="desktop-review-summary"
        href="#avaliacoes"
        aria-label={`Nota ${summary.averageText} de 5. Leia as ${summary.countText} do produto.`}
      >
        <strong data-hero-review-average="">{summary.averageText}</strong>
        <span className="desktop-review-stars" aria-hidden="true">
          ★★★★★
        </span>
        <span className="desktop-review-count" data-hero-review-count="">
          {summary.countText}
        </span>
      </a>
      <div className="desktop-price-band">
        <div>
          <span className="desktop-pack-label">{pack === "kit" ? "Kit com 2 AquaBlast" : "1 unidade AquaBlast"}</span>
          <div className="pix-price-row">
            <img className="pix-icon" src="/icons/pix.svg" alt="" />
            <strong className="desktop-price" aria-live="polite">
              {price.pix}
            </strong>
            <span className="pix-label">no Pix</span>
          </div>
          <p className="card-installments" data-selected-installments="">
            {price.installments}
          </p>
        </div>
        <span className="desktop-kit-saving" hidden={pack !== "kit"}>
          ECONOMIZE
          <br />
          <b>R$ 79,90</b>
        </span>
      </div>
      <div className="desktop-shipping">
        <span className="desktop-detail-label">Entrega</span>
        <div className="desktop-delivery-content">
          <img src="/envio.webp" alt="Dia das Crianças: envio rápido e postagem ágil" width={1672} height={941} />
          <div>
            <strong>
              Envio{" "}
              <span className="shipping-full">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M13 2 3 14h7l-1 8L21 8h-7z" />
                </svg>
                FULL
              </span>{" "}
              para todo o Brasil
            </strong>
            <span className="tracking-reassurance">
              <img src="/icons/package-tracking.svg" alt="" />
              Com código de rastreamento
            </span>
          </div>
        </div>
      </div>
      <div className="desktop-details-row">
        <span className="desktop-detail-label">Detalhes</span>
        <ul className="desktop-product-features">
          <li>
            <img src="/efeito-luz.webp" alt="" />
            Efeito luminoso
          </li>
          <li>
            <img src="/acessorio-bateria.webp" alt="" />
            Recarregável
          </li>
          <li>
            <img src="/acessorio-tambor.webp" alt="" />
            Tambor de água
          </li>
        </ul>
      </div>
      <div className="desktop-package-choice">
        <span className="desktop-field-label">
          Escolha seu presente{" "}
          <span id="desktop-choice-hint" className="desktop-choice-hint">
            Clique para escolher
          </span>
        </span>
        <div
          className="desktop-packages"
          role="group"
          aria-label="Escolha a quantidade de AquaBlast"
          aria-describedby="desktop-choice-hint"
        >
          <button
            data-desktop-pack="unit"
            aria-label="Selecionar 1 unidade"
            aria-pressed={pack === "unit"}
            onClick={() => selectPack("unit")}
          >
            <span className="desktop-choice-indicator" aria-hidden="true">
              <img src="/icons/check.svg" alt="" />
            </span>
            <span className="desktop-package-art">
              <img className="unit-product" src={`/produto-${color}.webp`} alt={unitAlt} />
            </span>
            <span className="desktop-package-copy">
              <strong>1 unidade</strong>
            </span>
          </button>
          <button
            data-desktop-pack="kit"
            aria-label="Selecionar kit com 2"
            aria-pressed={pack === "kit"}
            onClick={() => selectPack("kit")}
          >
            <span className="desktop-choice-indicator" aria-hidden="true">
              <img src="/icons/check.svg" alt="" />
            </span>
            <span className="desktop-package-art is-pair">
              <img src="/produto-azul.webp" alt="" />
              <img src="/produto-preto.webp" alt="" />
            </span>
            <span className="desktop-package-copy">
              <strong>Kit com 2</strong>
            </span>
          </button>
        </div>
      </div>
      <div className="desktop-color-selection" data-desktop-colors="unit" hidden={pack !== "unit"}>
        <span className="desktop-field-label">
          Cor: <b className="color-label">{COLOR_LABELS[color]}</b>
        </span>
        <UnitSwatches label="Cor da unidade no desktop" />
      </div>
      <div className="desktop-kit-selection" data-desktop-colors="kit" hidden={pack !== "kit"}>
        <div className="desktop-kit-color">
          <span className="desktop-field-label">
            <b>1</b> Primeiro brinquedo
          </span>
          <KitSwatches index={0} label="Cor do 1º AquaBlast no desktop" />
        </div>
        <div className="desktop-kit-color">
          <span className="desktop-field-label">
            <b>2</b> Segundo brinquedo
          </span>
          <KitSwatches index={1} label="Cor do 2º AquaBlast no desktop" />
        </div>
      </div>
      <a className="button button-green desktop-buy" href={CHECKOUT_URL}>
        {pack === "kit" ? "Comprar kit com 2" : "Comprar 1 unidade"}
      </a>
      <p className="desktop-checkout-note">Confira cor, quantidade e valor no checkout.</p>
    </div>
  );
}

export function Hero() {
  const { selectHeroVideo } = useSelection();

  // Como no app.js: volta ao vídeo ao restaurar a página (bfcache) e ao entrar no layout mobile.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) selectHeroVideo();
    };
    const mobile = window.matchMedia(MOBILE_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) selectHeroVideo();
    };
    window.addEventListener("pageshow", onPageShow);
    mobile.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      mobile.removeEventListener("change", onChange);
    };
  }, [selectHeroVideo]);

  return (
    <section className="catalog-hero" id="inicio" aria-labelledby="hero-title">
      <div className="container catalog-grid">
        <CatalogGallery>
          <DesktopProductPanel />
          <HeroFeaturedVideo />
        </CatalogGallery>
      </div>
    </section>
  );
}
