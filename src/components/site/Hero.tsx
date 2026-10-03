"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { reviews } from "@/data/reviews";
import { CAMPAIGN_PHOTO, COLOR_LABELS, HERO_PHOTOS, KIT_PHOTO, KIT_SAVING, MOBILE_QUERY, PRICES } from "@/lib/site/constants";
import { PurchaseLink } from "./PurchaseLink";
import { reviewSummary } from "@/lib/site/reviews-summary";
import { HeroFeaturedVideo } from "./HeroFeaturedVideo";
import { UnitColorCue, UnitSwatches } from "./ColorSwatches";
import { KitColorSteps } from "./KitColorSteps";
import { scrollBehavior } from "./media-query";
import { useSelection } from "./SelectionProvider";

const summary = reviewSummary(reviews);

// No HTML original, o painel de produto e o vídeo em destaque ficam DENTRO de .catalog-gallery.
function CatalogGallery({ children }: { children: ReactNode }) {
  const {
    color,
    heroPhoto,
    heroTouched,
    colorTouched,
    videoActive,
    isCustomKit,
    kitColors,
    kitName,
    kitAlt,
    selectHeroOption,
    selectHeroVideo,
  } = useSelection();

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
  // A miniatura "1 unidade" espelha o destaque: campanha ate a pessoa escolher uma cor de forma
  // explicita (colorTouched), produto-<cor> depois. selectPack("unit") usa a mesma regra
  // (unitPhotoIndex no SelectionProvider), entao clicar aqui sempre mostra a mesma imagem no destaque.
  const colorName = COLOR_LABELS[color].toLowerCase();
  const kitPairName = `${COLOR_LABELS[kitColors[0]].toLowerCase()} e ${COLOR_LABELS[kitColors[1]].toLowerCase()}`;

  const onVideoThumb = () => {
    selectHeroVideo();
    if (window.matchMedia(MOBILE_QUERY).matches) {
      document.querySelector(".hero-featured-video")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    }
  };

  return (
    <div className={videoActive ? "catalog-gallery desktop-video-active" : "catalog-gallery"}>
      <h1 id="hero-title" className="visually-hidden">
        AquaBlast: brinquedo de água elétrico, presente de Dia das Crianças — escolha 1 unidade ou o kit com 2
      </h1>
      <div className="catalog-gift-label mobile-gallery-label">
        <img src="/thumbs/gift-60.webp" alt="" width={34} height={34} />
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
        {/* Peso no celular (2026-10-01): a arte de abertura tem 353 KB em 1254px e no celular fica escondida
            atras do video; o srcSet faz o celular baixar a de 760px (o desktop continua com a grande). */}
        <img
          id="hero-product-photo"
          src={item.src}
          srcSet={item.src === CAMPAIGN_PHOTO.src ? "/thumbs/campanha-abertura-760.webp 760w, /campanha-abertura.webp 1254w" : undefined}
          sizes={item.src === CAMPAIGN_PHOTO.src ? "(max-width: 56.25rem) 260px, 40rem" : undefined}
          alt={alt}
          width={1254}
          height={1254}
          hidden={pair}
        />
        <span className="catalog-kit-preview" hidden={!pair}>
          <img
            data-kit-image="0"
            src={`/thumbs/produto-${kitColors[0]}-610.webp`}
            alt={`AquaBlast ${COLOR_LABELS[kitColors[0]].toLowerCase()}`}
            loading="lazy"
            decoding="async"
          />
          <img
            data-kit-image="1"
            src={`/thumbs/produto-${kitColors[1]}-610.webp`}
            alt={`AquaBlast ${COLOR_LABELS[kitColors[1]].toLowerCase()}`}
            loading="lazy"
            decoding="async"
          />
        </span>
        <span className="catalog-zoom-icon">
          <img className="icon" src="/icons/arrow-up-right.svg" alt="" loading="lazy" decoding="async" />
        </span>
        <span className="catalog-photo-label" id="hero-photo-label">
          {label}
        </span>
      </button>
      <h2 className="catalog-choice-title" id="catalog-choice-title">
        {/* Celular (dono, 03/10): chamada explicita de compra; no desktop a pilula "Selecione seu kit" e outra. */}
        <a className="catalog-choice-link" href="#ofertas">Comprar agora</a>
      </h2>
      <div className="catalog-thumbnails" role="group" aria-label="Fotos e vídeo do produto">
        <button
          className="desktop-video-thumb"
          data-desktop-video=""
          aria-label="Ver vídeo do AquaBlast"
          aria-pressed={videoActive}
          onClick={onVideoThumb}
        >
          <span className="video-thumb-preview" aria-hidden="true">
            <img className="video-thumb-frame" src="/thumbs/video-moldura-270.webp" alt="" width={1254} height={1254} />
            <img className="video-thumb-poster" src="/thumbs/video-destaque-poster-108.webp" alt="" />
          </span>
          <span className="video-thumb-label">▶ Ver vídeo</span>
        </button>
        <button
          className="art-thumb"
          data-hero-photo="0"
          aria-label={colorTouched ? `Escolher 1 unidade AquaBlast ${colorName}` : "Escolher 1 unidade AquaBlast"}
          aria-pressed={isPressed(0)}
          onClick={() => selectHeroOption(0)}
        >
          {colorTouched ? (
            <img
              className="unit-thumb-product"
              src={`/thumbs/produto-${color}-110.webp`}
              srcSet={`/thumbs/produto-${color}-110.webp 110w, /thumbs/produto-${color}-610.webp 610w`}
              sizes="(max-width: 56.25rem) 7rem, 6.625rem"
              alt=""
              width={110}
              height={110}
              decoding="async"
            />
          ) : (
            <img src="/thumbs/campanha-abertura-270.webp" alt="" width={1254} height={1254} />
          )}
          <span>1 unidade</span>
        </button>
        <button
          className="art-thumb"
          data-hero-photo="1"
          aria-label={isCustomKit ? `Escolher kit com 2 — ${kitPairName}` : "Escolher kit com 2 — arte azul e preto"}
          aria-pressed={isPressed(1)}
          onClick={() => selectHeroOption(1)}
        >
          {isCustomKit ? (
            <span className="kit-thumb-pair" aria-hidden="true">
              <img src={`/thumbs/produto-${kitColors[0]}-110.webp`} alt="" width={110} height={110} decoding="async" />
              <img src={`/thumbs/produto-${kitColors[1]}-110.webp`} alt="" width={110} height={110} decoding="async" />
            </span>
          ) : (
            <img className="kit-thumb-art" src="/thumbs/campanha-kit-azul-preto-270.webp" alt={KIT_PHOTO.alt} width={1254} height={1254} />
          )}
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
  // Orientacao da pilula: fica visivel (e o grupo pulsa) ate a pessoa clicar em um dos pacotes.
  const [guiding, setGuiding] = useState(false);

  // A pilula do painel nao leva a #ofertas (tiraria a pessoa do painel onde ja esta escolhendo):
  // foca o primeiro pacote e liga a orientacao "Escolha aqui" sobre as opcoes logo abaixo (sem scroll).
  const handlePillClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setGuiding(true);
    document.querySelector<HTMLButtonElement>("#desktop-packages button")?.focus({ preventScroll: true });
  };

  const choosePack = (next: typeof pack) => {
    setGuiding(false);
    selectPack(next);
  };

  return (
    <div className="desktop-product-panel" aria-labelledby="desktop-product-title">
      <div className="desktop-product-heading">
        <h2 id="desktop-product-title">Brinquedo de água elétrico com efeito luminoso</h2>
      </div>
      {/* Sem aria-label: o nome vem do conteúdo (texto visível + trechos visually-hidden) e continua
          "Nota 4,9 de 5. Leia as 66 avaliações do produto.", sem o "label-content-name-mismatch". */}
      <a className="desktop-review-summary" href="#avaliacoes">
        <span className="visually-hidden">Nota </span>
        <strong data-hero-review-average="">{summary.averageText}</strong>
        <span className="visually-hidden"> de 5. Leia as </span>
        <span className="desktop-review-stars" aria-hidden="true">
          ★★★★★
        </span>
        <span className="desktop-review-count" data-hero-review-count="">
          {summary.countText}
        </span>
        <span className="visually-hidden"> do produto.</span>
      </a>
      <div className="desktop-price-band">
        <div>
          <span className="desktop-pack-label">{pack === "kit" ? "Kit com 2 AquaBlast" : "1 unidade AquaBlast"}</span>
          {/* Preco (pedido do dono, 27/09): parcela em destaque, Pix a vista com desconto embaixo. */}
          <div className="installment-row" aria-live="polite">
            <span className="installment-count">12x de</span>
            <strong className="desktop-price">{price.installment}</strong>
          </div>
          <div className="pix-price-row">
            <img className="pix-icon" src="/icons/pix.svg" alt="" loading="lazy" decoding="async" />
            <span className="pix-label">
              ou <strong>{price.pix}</strong> à vista no Pix
            </span>
            <span className="pix-discount">{price.pixDiscount} de desconto</span>
          </div>
        </div>
        <span className="desktop-kit-saving" hidden={pack !== "kit"}>
          ECONOMIZE
          <br />
          <b>{KIT_SAVING}</b>
        </span>
      </div>
      <div className="desktop-shipping">
        <span className="desktop-detail-label">Entrega</span>
        <div className="desktop-delivery-content">
          <img
            src="/thumbs/envio-375.webp"
            alt="Dia das Crianças: envio rápido e postagem ágil"
            width={1672}
            height={941}
            loading="lazy"
            decoding="async"
          />
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
              <img src="/icons/package-tracking.svg" alt="" loading="lazy" decoding="async" />
              Com código de rastreamento
            </span>
          </div>
        </div>
      </div>
      <div className="desktop-details-row">
        <span className="desktop-detail-label">Detalhes</span>
        <ul className="desktop-product-features">
          <li>
            <img src="/thumbs/efeito-luz-280.webp" alt="" loading="lazy" decoding="async" />
            Efeito luminoso
          </li>
          <li>
            <img src="/thumbs/acessorio-bateria-90.webp" alt="" loading="lazy" decoding="async" />
            Recarregável
          </li>
          <li>
            <img src="/thumbs/acessorio-tambor-90.webp" alt="" loading="lazy" decoding="async" />
            Tambor de água
          </li>
        </ul>
      </div>
      <div className="desktop-package-choice">
        <div className="desktop-choice-row">
          <h3 className="desktop-choice-title" id="desktop-choice-title">
            <a className="catalog-choice-link" href="#desktop-packages" onClick={handlePillClick}>
              Selecione seu kit
            </a>
          </h3>
          <span id="desktop-choice-hint" className="desktop-choice-hint">
            Clique para escolher
          </span>
        </div>
        <p className="desktop-choice-guide" role="status">
          {guiding ? "Escolha aqui: 1 unidade ou Kit com 2" : ""}
        </p>
        <div
          className={guiding ? "desktop-packages is-guiding" : "desktop-packages"}
          id="desktop-packages"
          role="group"
          aria-label="Escolha a quantidade de AquaBlast"
          aria-describedby="desktop-choice-hint"
        >
          <button
            data-desktop-pack="unit"
            aria-label="Selecionar 1 unidade"
            aria-pressed={pack === "unit"}
            onClick={() => choosePack("unit")}
          >
            <span className="desktop-choice-indicator" aria-hidden="true">
              <img src="/icons/check.svg" alt="" loading="lazy" decoding="async" />
            </span>
            <span className="desktop-package-art">
              <img className="unit-product" src={`/thumbs/produto-${color}-110.webp`} alt={unitAlt} loading="lazy" decoding="async" />
            </span>
            <span className="desktop-package-copy">
              <strong>1 unidade</strong>
              <span className="desktop-package-state" aria-hidden="true">
                {pack === "unit" ? "Selecionado" : "Escolher"}
              </span>
            </span>
          </button>
          <button
            data-desktop-pack="kit"
            aria-label="Selecionar kit com 2"
            aria-pressed={pack === "kit"}
            onClick={() => choosePack("kit")}
          >
            <span className="desktop-choice-indicator" aria-hidden="true">
              <img src="/icons/check.svg" alt="" loading="lazy" decoding="async" />
            </span>
            <span className="kit-best-tag">Mais vendido</span>
            <span className="desktop-package-art is-pair">
              <img src="/thumbs/produto-azul-110.webp" alt="" loading="lazy" decoding="async" />
              <img src="/thumbs/produto-preto-110.webp" alt="" loading="lazy" decoding="async" />
            </span>
            <span className="desktop-package-copy">
              <strong>Kit com 2</strong>
              <span className="desktop-package-state" aria-hidden="true">
                {pack === "kit" ? "Selecionado" : "Escolher"}
              </span>
            </span>
          </button>
        </div>
      </div>
      <div
        className="desktop-color-selection"
        data-desktop-colors="unit"
        data-unit-cue={!colorTouched || undefined}
        data-active={pack === "unit" || undefined}
        hidden={pack !== "unit"}
      >
        <UnitColorCue />
        <span className="desktop-field-label">
          Cor: <b className="color-label">{colorTouched ? COLOR_LABELS[color] : "escolha"}</b>
        </span>
        <UnitSwatches label="Cor da unidade no desktop" />
      </div>
      <KitColorSteps context="desktop" />
      <PurchaseLink className="button button-green desktop-buy" pack={pack}>
        {pack === "kit" ? "Comprar kit com 2" : "Comprar 1 unidade"}
      </PurchaseLink>
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
