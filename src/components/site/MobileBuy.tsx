"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { COLOR_LABELS, PRICES } from "@/lib/site/constants";
import { useSelection } from "./SelectionProvider";

export function MobileBuy() {
  const { pack, color } = useSelection();
  const [offersVisible, setOffersVisible] = useState(false);

  // A barra fica visivel desde o carregamento (Clarity 03/10: 67% saiam sem ver o preco). Ela so some quando a secao
  // #ofertas esta na tela, para nao duplicar o botao de compra dos cards. Antes ela tambem ficava escondida enquanto o
  // botao do topo (#catalog-choice-title) aparecia; esse estado e o aria-hidden/inert dele foram removidos.
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
    <aside
      className={["mobile-buy", offersVisible && "offers-visible"].filter(Boolean).join(" ")}
      aria-label="Presente selecionado"
    >
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
