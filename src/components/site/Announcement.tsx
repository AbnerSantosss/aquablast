import Link from "next/link";
import { money } from "@/lib/checkout/own/masks";
import { FULL_SHIPPING_CENTS, FULL_SHIPPING_LABEL } from "@/lib/checkout/own/shipping";
import { DELIVERY_PATH } from "@/lib/site/constants";

const shippingText = `${FULL_SHIPPING_LABEL} ${money(FULL_SHIPPING_CENTS)}`;

export function SkipLink() {
  return <a className="skip" href="#conteudo">Pular para o conteúdo</a>;
}

/** Campanha sem prazo ou movimento; a faixa continua levando às informações de entrega. */
export function Announcement() {
  return <div className="announcement"><div className="container announcement-inner">Oferta de Verão · {shippingText}</div></div>;
}

export function DeliveryTicker(props: { promise?: string | null }) {
  void props;
  return (
    <Link className="delivery-ticker summer-announcement" href={DELIVERY_PATH} aria-label={`Oferta de Verão. ${shippingText}. Veja como funciona a entrega`}>
      <span>Oferta de Verão <span aria-hidden="true">·</span> {shippingText}</span>
    </Link>
  );
}
