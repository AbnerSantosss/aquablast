import { Truck } from "lucide-react";
import type { Theme } from "@/lib/checkout/own/theme";

/** Faixa de frete no topo (origem app/checkout.tsx, ".ship-bar"). Some quando `shipBarEnabled` está desligado no tema. */
export function ShipBar({ theme }: { theme: Theme }) {
  if (!theme.shipBarEnabled) return null;
  return (
    <div className="ship-bar">
      <Truck aria-hidden="true" size={16} />
      <strong>{theme.shipBarText}</strong>
      {theme.shipBarNote ? <i>{theme.shipBarNote}</i> : null}
    </div>
  );
}
