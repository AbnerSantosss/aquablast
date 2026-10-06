"use client";

import Image from "next/image";
import { useState } from "react";
import { reviews } from "@/data/reviews";
import { COLOR_KEYS, COLOR_LABELS, KIT_SAVING, PRICES } from "@/lib/site/constants";
import { reviewSummary } from "@/lib/site/reviews-summary";
import { HeroTrustBadges } from "./HeroTrustBadges";
import { KitColorGuide } from "./KitColorGuide";
import { PurchaseLink } from "./PurchaseLink";
import { useSelection } from "./SelectionProvider";

const summary = reviewSummary(reviews);

type HeroBuyPanelProps = {
  onSelectionChange: (reason: "pack" | "color", nextPack?: "unit" | "kit") => void;
};

export function HeroBuyPanel({ onSelectionChange }: HeroBuyPanelProps) {
  const { pack, setPack, color, chooseColor, kitReady } = useSelection();
  const [guideRequest, setGuideRequest] = useState(0);
  const pair = pack === "kit";
  const price = PRICES[pack];
  const openKitGuide = () => setGuideRequest((request) => request + 1);

  return (
    <div className="summer-buy desktop-product-panel mobile-top-buy">
      <span className="summer-eyebrow">AQUABLAST · OFERTA DE VERÃO</span>
      <h1 id="hero-title">Lançador de água elétrico. Diversão a cada disparo.</h1>
      <a className="summer-rating" href="#avaliacoes">
        <span aria-hidden="true">★★★★★</span>
        <strong data-hero-review-average>{summary.averageText}</strong>
        <span data-hero-review-count>675 avaliações</span>
      </a>
      <p className="summer-description">Disparos sequenciais, luz LED amarela e bateria recarregável por USB.</p>
      <div className="summer-price" aria-live="polite">
        <Image src="/icons/pix.svg" alt="Pix" width={25} height={25} />
        <strong>{price.pix}</strong>
        <span>à vista no Pix</span>
        <small>ou 12x de {price.installment} sem juros</small>
      </div>
      <div
        className="summer-packs"
        role="group"
        aria-label="Escolha a quantidade de AquaBlast"
        data-field-label="Quantidade"
      >
        <button
          type="button"
          className="summer-pack-kit"
          aria-pressed={pair}
          onClick={() => { setPack("kit"); onSelectionChange("pack", "kit"); }}
        >
          <em className="summer-saving-tag">Economize {KIT_SAVING}</em>
          <strong>Kit com 2</strong>
          <span>{PRICES.kit.pix} no Pix</span>
        </button>
        <button
          type="button"
          aria-pressed={!pair}
          onClick={() => { setPack("unit"); onSelectionChange("pack", "unit"); }}
        >
          <strong>1 unidade</strong>
          <span>{PRICES.unit.pix} no Pix</span>
        </button>
      </div>
      {pair ? (
        <KitColorGuide openRequest={guideRequest} onSelectionChange={() => onSelectionChange("color")} />
      ) : (
        <div className="summer-colors">
          <div
            className="summer-color-row"
            role="group"
            aria-label="Cor do AquaBlast no topo"
          >
            <span>Cor</span>
            {COLOR_KEYS.map((option) => (
              <button
                key={option}
                type="button"
                data-color={option}
                aria-label={COLOR_LABELS[option]}
                aria-pressed={color === option}
                onClick={() => {
                  chooseColor(option);
                  onSelectionChange("color");
                }}
              >
                <Image src={"/thumbs/produto-" + option + "-110.webp"} alt="" width={60} height={60} sizes="48px" />
                <span>{COLOR_LABELS[option]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {pair && !kitReady ? (
        <button id="hero-kit-guide-trigger" type="button" className="button button-green summer-buy-button" aria-haspopup="dialog" onClick={openKitGuide}>
          Escolher cores do kit
        </button>
      ) : (
        <PurchaseLink direct pack={pack} className="button button-green summer-buy-button">
          {pair ? "Quero meu kit de verão" : "Quero o meu"}
        </PurchaseLink>
      )}
      <HeroTrustBadges />
    </div>
  );
}
