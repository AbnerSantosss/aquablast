import Link from "next/link";
import { Truck, PackageCheck, RefreshCcw, Wallet, Headphones } from "lucide-react";
import { DELIVERY_PATH, RETURNS_PATH } from "@/lib/site/constants";
import { SelectOfferLink } from "./SelectOfferLink";

const benefits = [
  { icon: Truck, title: "Frete grátis", text: "Para todo o Brasil.", href: DELIVERY_PATH, link: "Sobre a entrega" },
  { icon: PackageCheck, title: "Rastreio no site", text: "Acompanhe sua compra por aqui.", href: "/rastrear", link: "Rastrear pedido" },
  { icon: RefreshCcw, title: "Troca se chegar quebrado", text: "E 7 dias de arrependimento após receber.", href: RETURNS_PATH, link: "Trocas e devoluções" },
  { icon: Wallet, title: "Desconto no Pix", text: "Valor menor que no cartão, informado antes de pagar.", href: "#ofertas", link: "Ver as ofertas" },
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
          {benefits.map(({ icon: Icon, ...item }) => (
            <article key={item.title}>
              <Icon size={26} aria-hidden="true" />
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
        <p>Escolha suas cores e prepare a próxima brincadeira em família.</p>
        <SelectOfferLink className="button button-green">Ver ofertas de verão</SelectOfferLink>
      </div>
    </section>
  );
}
