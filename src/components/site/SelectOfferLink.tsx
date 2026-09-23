"use client";

import type { MouseEvent, ReactNode } from "react";
import { useSelection } from "./SelectionProvider";

/** `[data-select-offer]`: rola até o card da oferta selecionada e foca o botão marcado. */
export function SelectOfferLink({ className, children }: { className: string; children: ReactNode }) {
  const { selectOffer } = useSelection();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    selectOffer();
  };
  return (
    <a className={className} data-select-offer="" href="#ofertas" onClick={onClick}>
      {children}
    </a>
  );
}
