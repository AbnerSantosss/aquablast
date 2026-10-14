import Link from "next/link";
import { FREE_SHIPPING_LABEL } from "@/lib/checkout/own/shipping";
import { DELIVERY_PATH } from "@/lib/site/constants";

// Frete gratis e o padrao (pedido do dono, 2026-10-11): o Frete FULL e o preco dele so aparecem na escolha da entrega, no checkout.
const shippingText = FREE_SHIPPING_LABEL;

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
