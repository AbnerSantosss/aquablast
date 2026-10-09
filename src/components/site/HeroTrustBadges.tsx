import { BadgePercent, PackageSearch, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FULL_SHIPPING_LABEL } from "@/lib/checkout/own/shipping";
import { DELIVERY_PATH } from "@/lib/site/constants";
import styles from "./HeroTrustBadges.module.css";

type TrustBenefit = {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
};

const benefits: TrustBenefit[] = [
  { title: FULL_SHIPPING_LABEL, description: "Para todo o Brasil", icon: Truck, href: DELIVERY_PATH },
  { title: "Rastreio no site", description: "Acompanhe seu pedido", icon: PackageSearch, href: "/rastrear" },
  { title: "Desconto no Pix", description: "Valor menor que no cartão", icon: BadgePercent },
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
