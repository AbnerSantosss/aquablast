"use client";
import Image from "next/image";
import { money } from "@/lib/checkout/own/masks";
import { FULL_SHIPPING_CENTS, FULL_SHIPPING_LABEL } from "@/lib/checkout/own/shipping";
import { COLOR_LABELS } from "@/lib/site/constants";
import type { Color, Pack } from "@/lib/site/types";
import { productPhotography } from "@/lib/site/product-photography";
import { UnitSwatches } from "./ColorSwatches";
import { usePrices } from "./PricesProvider";
import { useSelection } from "./SelectionProvider";
import { PurchaseLink } from "./PurchaseLink";
import { WarrantyNote } from "./WarrantyNote";
import { KitColorGuide } from "./KitColorGuide";

function OfferFooter({ pack }: { pack: Pack }) {
  const prices = usePrices();
  const price = prices[pack];
  return (
    <div className="summer-offer-footer">
      <div className="summer-offer-total"><strong>{price.pix}</strong><span><Image src="/icons/pix.svg" alt="" width={18} height={18} />à vista no Pix</span></div>
      <p className="summer-offer-installments">{prices.installments > 1 ? <>ou {prices.installments}x de <strong>{price.installment}</strong> no cartão</> : <>ou <strong>{price.card}</strong> no cartão</>}</p>
      <p className="summer-offer-delivery"><Image src="/icons/truck.svg" alt="" width={18} height={18} />{pack === "kit" ? "Frete grátis para todo o Brasil" : `+ ${FULL_SHIPPING_LABEL} ${money(FULL_SHIPPING_CENTS)}`}</p>
      <PurchaseLink className="button button-green full-width" pack={pack}>{pack === "kit" ? "Quero o kit com 2" : "Quero o meu"}</PurchaseLink>
      <WarrantyNote />
    </div>
  );
}

function OfferArt({ colors }: { colors: Color[] }) {
  const photo = productPhotography(colors, "gallery");
  return (
    <div className="summer-offer-art">
      <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 460px) calc(100vw - 32px), 430px" />
    </div>
  );
}

export function Offers() {
  const { color, colorTouched, kitColors } = useSelection();
  const prices = usePrices();
  return (
    <section className="section offers summer-offers" id="ofertas">
      <div className="container">
        <div className="section-heading centered offer-title"><span className="eyebrow">OFERTA DE VERÃO</span><h2>Escolha o seu <em>AquaBlast.</em></h2></div>
        <div className="price-grid summer-paired-offers">
          <article className="price-card summer-offer-card" data-price-card="kit">
            <div className="summer-offer-head"><h3>Kit com 2 AquaBlast</h3><span className="summer-offer-saving">Economize {prices.kitSaving}</span></div>
            <OfferArt colors={kitColors} />
            <p className="summer-offer-contents">Dois brinquedos, cada um com seus acessórios</p>
            <div className="summer-offer-options">
              <KitColorGuide openRequest={0} onSelectionChange={() => undefined} confirmFocusSelector="#ofertas [data-purchase='kit']" />
            </div>
            <OfferFooter pack="kit" />
          </article>
          <article className="price-card summer-offer-card is-selected" data-price-card="unit">
            <div className="summer-offer-head"><h3>1 unidade AquaBlast</h3></div>
            <OfferArt colors={[color]} />
            <p className="summer-offer-contents">Com tambor, bateria e cabo USB</p>
            <div className="summer-offer-options">
              <div className="color-choice" data-ready={colorTouched || undefined}>
                <p className="summer-choice-tip" role="status">{colorTouched ? "Cor escolhida. Continue em Quero o meu." : "Toque na sua cor favorita abaixo."}</p>
                <span>Escolha a cor{colorTouched ? ": " + COLOR_LABELS[color] : ""}</span>
                <UnitSwatches label="Cor da unidade" />
              </div>
            </div>
            <OfferFooter pack="unit" />
          </article>
        </div>
      </div>
    </section>
  );
}
