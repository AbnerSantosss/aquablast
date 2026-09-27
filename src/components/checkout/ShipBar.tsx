import { Truck } from "lucide-react";
import type { Theme } from "@/lib/checkout/own/theme";

/**
 * Divide o texto do tema em "destaque" + "resto" para reproduzir o negrito da origem
 * (`<strong>Frete FULL grátis</strong> para todo o Brasil`) sem mudar o campo do painel: o destaque é tudo
 * antes do primeiro " para ". Sem " para ", o texto inteiro fica em negrito.
 */
function splitLead(text: string): [string, string] {
  const i = text.indexOf(" para ");
  return i > 0 ? [text.slice(0, i), text.slice(i)] : [text, ""];
}

/** Faixa de frete no topo (origem app/checkout.tsx, ".ship-bar"). Some quando `shipBarEnabled` está desligado no tema. */
export function ShipBar({ theme }: { theme: Theme }) {
  if (!theme.shipBarEnabled) return null;
  const [lead, rest] = splitLead(theme.shipBarText);
  return (
    <div className="ship-bar">
      <Truck size={16} aria-hidden="true" />
      <span>
        <strong>{lead}</strong>
        {rest}
      </span>
      {theme.shipBarNote ? (
        <>
          <i aria-hidden="true">·</i>
          <span className="ship-bar-date">{theme.shipBarNote}</span>
        </>
      ) : null}
    </div>
  );
}
