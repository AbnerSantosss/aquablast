"use client";
/* eslint-disable @next/next/no-img-element */

import type { MouseEvent, ReactNode } from "react";
import { COLOR_LABELS, PRICES } from "@/lib/site/constants";
import type { Pack } from "@/lib/site/types";
import { KitSwatches, UnitSwatches } from "./ColorSwatches";
import { useSelection } from "./SelectionProvider";
import { PurchaseLink } from "./PurchaseLink";

function OfferBenefits() {
  return (
    <ul className="offer-benefits" aria-label="Benefícios incluídos">
      <li>
        <span className="offer-benefit-photo light-detail">
          <img src="/thumbs/efeito-luz-280.webp" alt="Detalhe do cano luminoso" loading="lazy" decoding="async" />
        </span>
        <span>
          Efeito
          <br />
          luminoso
        </span>
      </li>
      <li>
        <span className="offer-benefit-photo">
          <img src="/thumbs/acessorio-bateria-90.webp" alt="Bateria recarregável do AquaBlast" loading="lazy" decoding="async" />
        </span>
        <span>
          Bateria
          <br />
          recarregável
        </span>
      </li>
      <li>
        <span className="offer-benefit-photo">
          <img src="/thumbs/acessorio-tambor-90.webp" alt="Reservatório em tambor do AquaBlast" loading="lazy" decoding="async" />
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
      <div className="offer-shipping offer-shipping-seal">
        <img src="/thumbs/envio-375.webp" alt="Dia das Crianças: envio rápido e postagem ágil" width={1672} height={941} loading="lazy" decoding="async" />
        <span>Consulte o prazo para seu CEP</span>
      </div>
      <div className="offer-price-line">
        <div className="price pix-price-row">
          <span className="pix-value">
            <strong className="pix-amount">{price.pix}</strong>
          </span>
          <span className="pix-label">
            no Pix <img className="pix-icon" src="/icons/pix.svg" alt="" loading="lazy" decoding="async" />
          </span>
        </div>
        <p className="card-installments">{price.installments}</p>
      </div>
      <div className="offer-reassurance">
        <span>
          <img className="icon" src="/icons/check.svg" alt="" loading="lazy" decoding="async" />
          Cores à sua escolha
        </span>
        <span>
          <img className="icon" src="/icons/headphones.svg" alt="" loading="lazy" decoding="async" />
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
  const { color } = useSelection();
  const colorLabel = COLOR_LABELS[color];

  return (
    <section className="section offers" id="ofertas">
      <div className="container">
        <div className="section-heading centered offer-title">
          <span className="eyebrow">MENOS TELA. MAIS DIVERSÃO.</span>
          <h2>
            Escolha o <em>presente ideal.</em>
          </h2>
        </div>
        <div className="price-grid">
          <PriceCard pack="unit" className="price-card">
            <div className="price-header">
              <h3>1 unidade AquaBlast</h3>
              <span className="offer-card-tag">IDEAL PARA PRESENTEAR</span>
            </div>
            <div className="packshot single unit-campaign-art">
              <div className="unit-art-scene">
                <img className="unit-product" src={`/thumbs/produto-${color}-610.webp`} alt={`AquaBlast ${colorLabel.toLowerCase()}`} loading="lazy" decoding="async" />
              </div>
              <span className="packshot-caption">Uma surpresa. Muitos sorrisos.</span>
            </div>
            <div className="offer-card-body">
              <p className="offer-included">1 AquaBlast na cor que você escolher</p>
              <OfferBenefits />
              <div className="color-choice">
                <span>
                  Cor: <strong className="color-label">{colorLabel}</strong>
                </span>
                <UnitSwatches label="Cor da unidade" />
              </div>
              <OfferFooter pack="unit" buy="Comprar 1 unidade" />
            </div>
          </PriceCard>
          <PriceCard pack="kit" className="price-card kit-card">
            <div className="price-header">
              <h3>Kit com 2 AquaBlast</h3>
              <span className="offer-card-tag kit-emotion-tag">
                <strong>Brinque em dupla!</strong>
                <small>Diversão garantida</small>
              </span>
            </div>
            <div className="packshot pair kit-matching kit-artwork kit-family-art">
              <img
                className="kit-family-photo"
                src="/thumbs/kit-familia-v45-1020.webp"
                srcSet="/thumbs/kit-familia-v45-720.webp 720w, /thumbs/kit-familia-v45-1020.webp 1020w"
                sizes="(max-width: 42.5rem) calc(100vw - 2.25rem), 31rem"
                width={1500}
                height={500}
                alt="Imagem ilustrativa de pai e filho brincando com AquaBlast preto e azul no jardim"
                loading="lazy"
                decoding="async"
              />
              <span className="packshot-caption">Diversão em dobro. Escolha suas cores abaixo.</span>
            </div>
            <div className="offer-card-body">
              <p className="offer-included">2 AquaBlast com cores à sua escolha</p>
              <OfferBenefits />
              <div className="kit-color-selectors">
                <div className="kit-color-row">
                  <span className="choice-row-label">
                    <b>1</b>
                    <span>
                      Primeiro brinquedo<small>Escolha a cor</small>
                    </span>
                  </span>
                  <KitSwatches index={0} label="Cor do 1º AquaBlast do kit na oferta" />
                </div>
                <div className="kit-color-row">
                  <span className="choice-row-label">
                    <b>2</b>
                    <span>
                      Segundo brinquedo<small>Escolha a cor</small>
                    </span>
                  </span>
                  <KitSwatches index={1} label="Cor do 2º AquaBlast do kit na oferta" />
                </div>
              </div>
              <OfferFooter pack="kit" buy="Comprar kit com 2" />
            </div>
          </PriceCard>
        </div>
      </div>
    </section>
  );
}
