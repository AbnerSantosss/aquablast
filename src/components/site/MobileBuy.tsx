"use client";
import { PRICES } from "@/lib/site/constants";
import { useSelection } from "./SelectionProvider";
import { PurchaseLink } from "./PurchaseLink";

export function MobileBuy() {
  const { pack, kitReady } = useSelection();
  return <aside className="mobile-buy summer-mobile-buy mobile-top-buy" aria-label="Compra rápida">
    <div><small>{pack === "kit" ? "Kit com 2 AquaBlast" : "1 unidade AquaBlast"}</small><strong>{PRICES[pack].pix}<span> no Pix</span></strong></div>
    {pack === "kit" && !kitReady ? <button type="button" className="button button-green" aria-haspopup="dialog" onClick={() => document.getElementById("hero-kit-guide-trigger")?.click()}>Escolher cores</button> : <PurchaseLink direct pack={pack} className="button button-green">{pack === "kit" ? "Quero meu kit" : "Quero o meu"}</PurchaseLink>}
  </aside>;
}
