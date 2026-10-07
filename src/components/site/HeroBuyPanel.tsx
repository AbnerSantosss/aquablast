"use client";

import Image from "next/image";
import { useState } from "react";
import { reviews } from "@/data/reviews";
import { KIT_SAVING, PRICES } from "@/lib/site/constants";
import { reviewSummary } from "@/lib/site/reviews-summary";
import { HeroTrustBadges } from "./HeroTrustBadges";
import { KitColorGuide } from "./KitColorGuide";
import { UnitColorGuide } from "./UnitColorGuide";
import { PurchaseLink } from "./PurchaseLink";
import { useSelection } from "./SelectionProvider";

const summary = reviewSummary(reviews);

type HeroBuyPanelProps = {
  onSelectionChange: (reason: "pack" | "color", nextPack?: "unit" | "kit") => void;
};

export function HeroBuyPanel({ onSelectionChange }: HeroBuyPanelProps) {
  const { pack, setPack, kitReady } = useSelection();
  const [guideRequest, setGuideRequest] = useState(0);
  const [unitGuideRequest, setUnitGuideRequest] = useState(0);
  const pair = pack === "kit";
  const price = PRICES[pack];
  const openKitGuide = () => setGuideRequest((request) => request + 1);
  const openUnitGuide = () => setUnitGuideRequest((request) => request + 1);

  return (
    <div className="summer-buy desktop-product-panel mobile-top-buy">
      <span className="summer-eyebrow">AQUABLAST · OFERTA DE VERÃO</span>
      <h1 id="hero-title">Lançador de água elétrico. Diversão a cada disparo.</h1>
      <a className="summer-rating" href="#avaliacoes">
        <span aria-hidden="true">★★★★★</span>
        <strong data-hero-review-average>{summary.averageText}</strong>
        <span data-hero-review-count>{summary.countText}</span>
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
          aria-haspopup="dialog"
          onClick={() => { setPack("kit"); onSelectionChange("pack", "kit"); openKitGuide(); }}
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
      <KitColorGuide openRequest={guideRequest} showSummary={pair && (guideRequest > 0 || kitReady)} onSelectionChange={() => onSelectionChange("color")} />
      <UnitColorGuide openRequest={unitGuideRequest} onSelectionChange={() => onSelectionChange("color")} />
      {!pair ? (
        <button id="hero-unit-guide-trigger" type="button" className="button button-green summer-buy-button" aria-haspopup="dialog" onClick={openUnitGuide}>
          Quero o meu
        </button>
      ) : !kitReady ? (
        <button id="hero-kit-guide-trigger" type="button" className="button button-green summer-buy-button" aria-haspopup="dialog" onClick={openKitGuide}>
          Quero meu kit
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
