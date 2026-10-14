"use client";
import { useEffect, useState } from "react";
import { FREE_SHIPPING_LABEL } from "@/lib/checkout/own/shipping";
import { usePrices } from "./PricesProvider";

export function MobileBuy() {
  const prices = usePrices();
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("inicio");
    if (!hero) return;
    const observer = new IntersectionObserver(([entry]) => {
      setShowBar(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  return <aside hidden={!showBar} className="mobile-buy summer-mobile-buy mobile-top-buy" aria-label="Compra rápida">
    <div><small>1 unidade AquaBlast</small><strong>{prices.unit.pix}<span> no Pix</span></strong><small>{FREE_SHIPPING_LABEL}</small></div>
    <button type="button" className="button button-green button-pulse" aria-haspopup="dialog" onClick={() => document.getElementById("hero-unit-guide-trigger")?.click()}>Quero meu AquaBlast</button>
  </aside>;
}
