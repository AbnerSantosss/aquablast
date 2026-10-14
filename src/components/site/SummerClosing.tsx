import Link from "next/link";
import { Headphones } from "lucide-react";
import Image from "next/image";
import { FREE_SHIPPING_LABEL } from "@/lib/checkout/own/shipping";
import { DELIVERY_PATH, RETURNS_PATH } from "@/lib/site/constants";
import { SelectOfferLink } from "./SelectOfferLink";

const benefits = [
  { image: "/checkout/selos/selo-envio.webp", title: FREE_SHIPPING_LABEL, text: "Para todo o Brasil, na unidade e no kit.", href: DELIVERY_PATH, link: "Sobre a entrega" },
  { image: "/checkout/selos/selo-garantia.webp", title: "Rastreio no site", text: "Acompanhe sua compra por aqui.", href: "/rastrear", link: "Rastrear pedido" },
  { image: "/checkout/selos/selo-seguro.webp", title: "Troca se chegar quebrado", text: "E 7 dias de arrependimento após receber.", href: RETURNS_PATH, link: "Trocas e devoluções" },
  { image: "/icons/pix.svg", title: "Desconto no Pix", text: "Valor menor que no cartão, informado antes de pagar.", href: "#ofertas", link: "Ver a oferta" },
];

export function PurchaseBenefits() {
  return (
    <section className="section summer-confidence" id="compra-segura" aria-labelledby="summer-confidence-title">
      <div className="container">
        <div className="section-heading">
          <div><span className="eyebrow">DA ESCOLHA À ENTREGA</span><h2 id="summer-confidence-title">Compre com <em>tranquilidade.</em></h2></div>
          <a className="text-link" href="#contato"><Headphones size={20} aria-hidden="true" /> Atendimento da loja</a>
        </div>
        <div className="summer-confidence-grid">
          {benefits.map(({ image, ...item }) => (
            <article key={item.title}>
              <span className={`summer-confidence-seal${image.endsWith("pix.svg") ? " is-pix" : ""}`} aria-hidden="true"><Image src={image} width={80} height={80} alt="" unoptimized /></span>
              <h3>{item.title}</h3><p>{item.text}</p>
              <Link href={item.href}>{item.link} →</Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SummerClosing() {
  return (
    <section className="section summer-closing" id="verao" aria-labelledby="summer-closing-title">
      <div className="container">
        <span className="eyebrow">QUINTAL, ÁGUA E GENTE JUNTO</span>
        <h2 id="summer-closing-title">Seu verão <em>começa aqui.</em></h2>
        <p>Escolha sua cor e prepare a próxima brincadeira em família.</p>
        <SelectOfferLink className="button button-green">Ver a oferta de verão</SelectOfferLink>
        <p className="summer-ps"><strong>P.S.</strong> {FREE_SHIPPING_LABEL} para todo o Brasil, rastreio no site e devolução em 7 dias com o frete de volta por nossa conta.</p>
      </div>
    </section>
  );
}
