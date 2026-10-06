"use client";
import Image from "next/image";
import type { MouseEvent, ReactNode } from "react";
import { COLOR_LABELS, KIT_SAVING, PRICES } from "@/lib/site/constants";
import type { Color, Pack } from "@/lib/site/types";
import { productPhotography } from "@/lib/site/product-photography";
import { UnitSwatches } from "./ColorSwatches";
import { KitColorSteps } from "./KitColorSteps";
import { useSelection } from "./SelectionProvider";
import { PurchaseLink } from "./PurchaseLink";

function OfferFooter({ pack, buy }: { pack: Pack; buy: string }) {
  const price = PRICES[pack];
  return (
    <div className="summer-offer-footer">
      <div className="summer-offer-total"><strong>{price.pix}</strong><span><Image src="/icons/pix.svg" alt="" width={18} height={18} />à vista no Pix</span></div>
      <p className="summer-offer-installments">ou 12x de <strong>{price.installment}</strong> no cartão</p>
      <PurchaseLink className="button button-green full-width" pack={pack}>{buy}</PurchaseLink>
      <p className="summer-offer-delivery"><Image src="/icons/truck.svg" alt="" width={18} height={18} />Frete grátis para todo o Brasil</p>
    </div>
  );
}

function PriceCard({ pack, children }: { pack: Pack; children: ReactNode }) {
  const { pack: selected, selectPack } = useSelection();
  const onClick = (event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest("button, a")) return;
    selectPack(pack);
  };
  return <article className={"price-card summer-offer-card" + (selected === pack ? " is-selected" : "")} data-price-card={pack} onClick={onClick}>{children}</article>;
}

function OfferArt({ colors }: { colors: Color[] }) {
  const photo = productPhotography(colors, "offer");
  return (
    <div className="summer-offer-art">
      <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 500px) calc(100vw - 56px), (max-width: 680px) 434px, (max-width: 800px) 44vw, 342px" />
    </div>
  );
}

export function Offers() {
  const { color, colorTouched, kitColors } = useSelection();
  return (
    <section className="section offers summer-offers" id="ofertas">
      <div className="container">
        <div className="section-heading centered offer-title"><span className="eyebrow">OFERTA DE VERÃO</span><h2>Escolha como <em>vai brincar.</em></h2></div>
        <div className="price-grid">
          <PriceCard pack="kit">
            <div className="summer-offer-head"><span className="summer-saving-tag">Economize {KIT_SAVING}</span><h3>Kit com 2 AquaBlast</h3></div>
            <OfferArt colors={kitColors} />
            <p className="summer-offer-contents">Com tambores, bateria e cabo USB</p>
            <div className="summer-offer-options"><KitColorSteps context="offer" /></div>
            <OfferFooter pack="kit" buy="Quero meu kit de verão" />
          </PriceCard>
          <PriceCard pack="unit">
            <div className="summer-offer-head"><span>PARA COMEÇAR</span><h3>1 unidade AquaBlast</h3></div>
            <OfferArt colors={[color]} />
            <p className="summer-offer-contents">Com tambor, bateria e cabo USB</p>
            <div className="summer-offer-options">
              <div className="color-choice">
                <span>Escolha a cor{colorTouched ? ": " + COLOR_LABELS[color] : ""}</span>
                <UnitSwatches label="Cor da unidade" />
              </div>
            </div>
            <OfferFooter pack="unit" buy="Quero o meu" />
          </PriceCard>
        </div>
      </div>
    </section>
  );
}
