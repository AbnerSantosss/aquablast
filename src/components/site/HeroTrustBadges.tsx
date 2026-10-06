import { PackageSearch, ShieldCheck, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./HeroTrustBadges.module.css";

type TrustBenefit = {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
};

const benefits: TrustBenefit[] = [
  { title: "Frete grátis", description: "Para todo o Brasil", icon: Truck },
  { title: "Rastreio no site", description: "Acompanhe seu pedido", icon: PackageSearch, href: "/rastrear" },
  { title: "Troca por avaria", description: "Se chegar quebrado", icon: ShieldCheck, href: "/trocas-e-devolucoes" },
];

export function HeroTrustBadges() {
  return (
    <div className={`summer-trust ${styles.trust}`} role="list" aria-label="Benefícios da sua compra">
      {benefits.map(({ title, description, icon: Icon, href }) => {
        const content = (
          <>
            <span className={styles.emblem} aria-hidden="true">
              <Icon size={24} strokeWidth={1.7} />
            </span>
            <span className={styles.copy}>
              <strong className={styles.title}>{title}</strong>
              <span className={styles.description}>{description}</span>
            </span>
          </>
        );

        return (
          <div className={styles.benefit} role="listitem" key={title}>
            {href ? <a className={styles.item} href={href}>{content}</a> : <span className={styles.item}>{content}</span>}
          </div>
        );
      })}
    </div>
  );
}
