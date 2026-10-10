import Link from "next/link";
import { FULL_SHIPPING_LABEL } from "@/lib/checkout/own/shipping";
import { DELIVERY_PATH } from "@/lib/site/constants";

// So o rotulo, sem o valor (pedido do dono, 2026-10-10): o preco do frete segue nas ofertas e no checkout.
const shippingText = FULL_SHIPPING_LABEL;

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
