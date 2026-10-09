"use client";

import Image from "next/image";
import { Droplet } from "lucide-react";
import { useState } from "react";
import { reviews } from "@/data/reviews";
import { reviewSummary } from "@/lib/site/reviews-summary";
import { HeroTrustBadges } from "./HeroTrustBadges";
import { WarrantyNote } from "./WarrantyNote";
import { UnitColorGuide } from "./UnitColorGuide";
import { usePrices } from "./PricesProvider";

const summary = reviewSummary(reviews);

type HeroBuyPanelProps = {
  onSelectionChange: () => void;
};

export function HeroBuyPanel({ onSelectionChange }: HeroBuyPanelProps) {
  const prices = usePrices();
  const [unitGuideRequest, setUnitGuideRequest] = useState(0);
  const price = prices.unit;
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

      <div className="summer-price" aria-live="polite">
        <Image src="/icons/pix.svg" alt="Pix" width={25} height={25} />
        <strong>{price.pix}</strong>
        <span>à vista no Pix</span>
        <small>{prices.installments > 1 ? `ou ${prices.installments}x de ${price.installment} sem juros` : `ou ${price.card} no cartão`}</small>
      </div>
      <UnitColorGuide openRequest={unitGuideRequest} onSelectionChange={onSelectionChange} />
      <button id="hero-unit-guide-trigger" type="button" className="button button-green summer-buy-button" aria-haspopup="dialog" onClick={openUnitGuide}>
        Quero o meu
      </button>
      <ul className="summer-bullets" aria-label="O que seu AquaBlast oferece">
        <li><Droplet size={15} aria-hidden="true" /><span><strong>Elétrico e automático:</strong> sem bombear.</span></li>
        <li><Droplet size={15} aria-hidden="true" /><span><strong>Recarrega por USB:</strong> sem pilha.</span></li>
        <li><Droplet size={15} aria-hidden="true" /><span><strong>Luz LED</strong> a cada disparo.</span></li>
        <li><Droplet size={15} aria-hidden="true" /><span><strong>Visor e tambor</strong> inclusos.</span></li>
      </ul>
      <WarrantyNote />
      <HeroTrustBadges />
    </div>
  );
}
