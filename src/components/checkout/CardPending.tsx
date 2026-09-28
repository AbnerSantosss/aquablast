import { Clock } from "lucide-react";
import { money } from "@/lib/checkout/own/masks";
import { PixLogo } from "./PixLogo";

/**
 * Corpo da opção Cartão quando ainda não há gateway de cartão (`checkout.cardComingSoon`, pedido do dono em 2026-09-28:
 * "deixe cartão disponível aguardando ser add o gateway"). A opção e a parcela aparecem normalmente, mas não pedimos
 * número de cartão que não dá para cobrar: o aviso diz isso e leva ao Pix, com a economia calculada pelo servidor.
 */
export function CardPending({ pixCents, cardCents, onPix }: { pixCents: number; cardCents: number; onPix: () => void }) {
  const saving = cardCents - pixCents;
  return (
    <div className="ck-card-pending">
      <p className="ck-testmode">
        <Clock size={18} aria-hidden="true" />
        <span>
          <strong>Pagamento no cartão em ativação.</strong> Por enquanto, finalize no Pix: aprovação na hora
          {saving > 0 ? ` e você economiza ${money(saving)}` : ""}.
        </span>
      </p>
      <button type="button" className="primary-button ck-pay-btn" onClick={onPix}>
        <PixLogo size={18} />
        PAGAR COM PIX · {money(pixCents)}
      </button>
    </div>
  );
}
