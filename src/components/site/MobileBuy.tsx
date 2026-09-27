"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { COLOR_LABELS, PRICES } from "@/lib/site/constants";
import { useSelection } from "./SelectionProvider";

export function MobileBuy() {
  const { pack, color } = useSelection();
  const [offersVisible, setOffersVisible] = useState(false);

  useEffect(() => {
    const target = document.querySelector("#ofertas");
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => setOffersVisible(entries[0].isIntersecting),
      { threshold: 0, rootMargin: "-80px 0px -20% 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const label = pack === "kit" ? "Kit com 2 AquaBlast" : `1 AquaBlast ${COLOR_LABELS[color].toLowerCase()}`;

  return (
    <aside className={offersVisible ? "mobile-buy offers-visible" : "mobile-buy"} aria-label="Presente selecionado">
      <div>
        <small className="mobile-label">{label}</small>
        {/* Preco (pedido do dono, 27/09): parcela em destaque, Pix a vista ao lado. */}
        <div className="mobile-pix-line">
          <strong className="mobile-price">12x de {PRICES[pack].installment}</strong>
          <small>ou {PRICES[pack].pix} no Pix</small>
        </div>
      </div>
      <a className="button button-green" href="#ofertas">
        Escolher presente <img className="icon" src="/icons/arrow-right.svg" alt="" />
      </a>
    </aside>
  );
}
