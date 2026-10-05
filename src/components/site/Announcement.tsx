import Link from "next/link";
import { DELIVERY_PATH } from "@/lib/site/constants";

export function SkipLink() {
  return <a className="skip" href="#conteudo">Pular para o conteúdo</a>;
}

/** Campanha sem prazo ou movimento; a faixa continua levando às informações de entrega. */
export function Announcement() {
  return <div className="announcement"><div className="container announcement-inner">Oferta de Verão · Frete grátis para todo o Brasil</div></div>;
}

export function DeliveryTicker(props: { promise?: string | null }) {
  void props;
  return (
    <Link className="delivery-ticker summer-announcement" href={DELIVERY_PATH} aria-label="Oferta de Verão. Frete grátis para todo o Brasil. Veja como funciona a entrega">
      <span>Oferta de Verão <span aria-hidden="true">·</span> Frete grátis para todo o Brasil</span>
    </Link>
  );
}
