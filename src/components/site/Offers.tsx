"use client";
import Image from "next/image";

import type { MouseEvent, ReactNode } from "react";
import { COLOR_LABELS, KIT_SAVING, PRICES } from "@/lib/site/constants";
import type { Pack } from "@/lib/site/types";
import { UnitColorCue, UnitSwatches } from "./ColorSwatches";
import { KitColorSteps } from "./KitColorSteps";
import { useSelection } from "./SelectionProvider";
import { PurchaseLink } from "./PurchaseLink";

function OfferBenefits() {
  return (
    <ul className="offer-benefits" aria-label="Detalhes do produto">
      <li>
        <span className="offer-benefit-photo light-detail">
          <Image src="/thumbs/efeito-luz-280.webp" alt="Detalhe da luz LED" width={90} height={90} />
        </span>
        <span>
          Efeito
          <br />
          luminoso
        </span>
      </li>
      <li>
        <span className="offer-benefit-photo">
          <Image src="/thumbs/acessorio-bateria-90.webp" alt="Bateria recarregável do AquaBlast" width={90} height={90} />
        </span>
        <span>
          Bateria
          <br />
          recarregável
        </span>
      </li>
      <li>
        <span className="offer-benefit-photo">
          <Image src="/thumbs/acessorio-tambor-90.webp" alt="Reservatório em tambor do AquaBlast" width={90} height={90} />
        </span>
        <span>
          Reservatório
          <br />
          em tambor
        </span>
      </li>
    </ul>
  );
}

function OfferFooter({ pack, buy }: { pack: Pack; buy: string }) {
  const price = PRICES[pack];
  return (
    <>
      <div className="offer-shipping summer-offer-shipping">
        <Image src="/icons/truck.svg" alt="" width={24} height={24} />
        <span><strong>Frete grátis</strong> para todo o Brasil</span>
      </div>
      {/* Preco (pedido do dono, 01/10): valor a vista no Pix em destaque, cartao parcelado como o "ou" embaixo. */}
      <div className="offer-price-line">
        <div className="price installment-row">
          <strong className="installment-amount">{price.pix}</strong>
        </div>
        <div className="pix-price-row">
          <span className="pix-label">
            <Image className="pix-icon" src="/icons/pix.svg" alt="" width={90} height={90} />
            à vista no Pix
          </span>
          <span className="pix-discount">{price.pixDiscount} de desconto</span>
        </div>
        <p className="card-installments">
          ou 12x de <strong>{price.installment}</strong> no cartão
        </p>
      </div>
      <div className="offer-reassurance">
        <span>
          <Image className="icon" src="/icons/check.svg" alt="" width={90} height={90} />
          Cores à sua escolha
        </span>
        <span>
          <Image className="icon" src="/icons/headphones.svg" alt="" width={90} height={90} />
          Atendimento humano
        </span>
      </div>
      <PurchaseLink className="button button-green full-width" pack={pack}>
        {buy}
      </PurchaseLink>
      <p className="offer-checkout-note">Confira cor, quantidade e valor no checkout.</p>
    </>
  );
}

function PriceCard({ pack, className, children }: { pack: Pack; className: string; children: ReactNode }) {
  const { pack: selected, selectPack } = useSelection();
  const onClick = (event: MouseEvent<HTMLElement>) => {
    // Como no app.js: clique no card seleciona a oferta, exceto sobre botões e links.
    if (event.target instanceof Element && event.target.closest("button, a")) return;
    selectPack(pack);
  };
  const classes = selected === pack ? `${className} is-selected` : className;
  return (
    <article className={classes} data-price-card={pack} onClick={onClick}>
      {children}
    </article>
  );
}

export function Offers() {
  const { color, colorTouched, pack, kitColors } = useSelection();
  const colorLabel = COLOR_LABELS[color];

  return (
    <section className="section offers summer-offers" id="ofertas">
      <div className="container">
        <div className="section-heading centered offer-title">
          <span className="eyebrow">OFERTA DE VERÃO</span>
          <h2>
            Escolha como <em>vai brincar.</em>
          </h2>
        </div>
        <div className="price-grid">
          <PriceCard pack="kit" className="price-card kit-card">
            <div className="price-header">
              <h3>Kit com 2 AquaBlast</h3>
              <span className="summer-kit-saving">Economize {KIT_SAVING}</span>
              <span className="offer-card-tag kit-emotion-tag">
                <strong>Um pra você, um pra eles</strong>
                <small>Escolha a cor de cada um</small>
              </span>
            </div>
            <div className="packshot summer-kit-products">
              {kitColors.map((kitColor, index) => (
                <Image key={index} src={`/produto-${kitColor}.webp`} width={1254} height={1254}
                  sizes="(max-width: 680px) 150px, 220px" alt={`AquaBlast ${index + 1}: ${COLOR_LABELS[kitColor].toLowerCase()}`} />
              ))}
              <span className="packshot-caption">Diversão em dupla, com as suas cores.</span>
            </div>
            <div className="offer-card-body">
              <p className="offer-included">2 AquaBlast com cores à sua escolha</p>
              <OfferBenefits />
              <KitColorSteps context="offer" />
              <OfferFooter pack="kit" buy="Quero meu kit de verão" />
            </div>
          </PriceCard>
          <PriceCard pack="unit" className="price-card">
            <div className="price-header">
              <h3>1 unidade AquaBlast</h3>
              <span className="offer-card-tag">PRA COMEÇAR A BRINCADEIRA</span>
            </div>
            <div className="packshot single unit-campaign-art">
              <div className="unit-art-scene">
                <Image className="unit-product" src={`/thumbs/produto-${color}-610.webp`} sizes="(max-width: 768px) 200px, 420px" alt={`AquaBlast ${colorLabel.toLowerCase()}`} width={610} height={610} />
              </div>
              <span className="packshot-caption">Quintal, água e vontade de brincar.</span>
            </div>
            <div className="offer-card-body">
              <p className="offer-included">1 AquaBlast na cor que você escolher</p>
              <OfferBenefits />
              <div
                className="color-choice"
                data-unit-cue={!colorTouched || undefined}
                data-active={pack === "unit" || undefined}
              >
                <UnitColorCue />
                <span>
                  Cor: <strong className="color-label">{colorTouched ? colorLabel : "escolha abaixo"}</strong>
                </span>
                <UnitSwatches label="Cor da unidade" />
              </div>
              <OfferFooter pack="unit" buy="Quero o meu" />
            </div>
          </PriceCard>
        </div>
      </div>
    </section>
  );
}
