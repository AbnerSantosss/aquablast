import { Truck } from "lucide-react";
import type { Theme } from "@/lib/checkout/own/theme";
import { money } from "@/lib/checkout/own/masks";

/**
 * O valor vem da cotação ou do pedido pago. Pedidos antigos sem snapshot mostram só o rastreamento.
 * A condição atual de frete nunca é aplicada retroativamente a um pedido pago.
 * A faixa fica oculta quando `shipBarEnabled` está desligado no tema.
 */
export function ShipBar({ theme, shippingCents, paid = false }: { theme: Theme; shippingCents: number | null; paid?: boolean }) {
  if (!theme.shipBarEnabled) return null;
  const label = paid ? "Frete" : "Frete FULL";
  const lead = shippingCents === null ? "Entrega com rastreamento" : shippingCents === 0 ? `${label} grátis` : `${label} por ${money(shippingCents)}`;
  const note = paid ? "" : theme.shipBarNote;
  return (
    <div className="ship-bar">
      <Truck size={16} aria-hidden="true" />
      <span>
        <strong>{lead}</strong>
      </span>
      {note ? (
        <>
          <i aria-hidden="true">·</i>
          <span className="ship-bar-date">{note}</span>
        </>
      ) : null}
    </div>
  );
}
