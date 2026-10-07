import Image from "next/image";
import { CreditCard } from "lucide-react";
import { PixLogo } from "./PixLogo";
import type { PayMethodUi } from "./types";
import styles from "./TrustSeals.module.css";

const seals = [
  { image: "selo-seguro.webp", title: "Dados protegidos", description: "Durante a compra" },
  { image: "selo-envio.webp", title: "Entrega rastreada", description: "Acompanhe seu pedido" },
  { image: "selo-garantia.webp", title: "Devolução em 7 dias", description: "Após o recebimento" },
];

export function TrustSeals({ methods, maxInstallments }: { methods: PayMethodUi[]; maxInstallments: number }) {
  return (
    <section className={`trust-seals ${styles.panel}`} aria-label="Garantias da compra">
      <ul className={styles.list}>
        {seals.map((seal) => (
          <li className={styles.seal} key={seal.image}>
            <span className={styles.medallion}>
              <Image
                src={`/checkout/selos/${seal.image}`}
                alt=""
                width={192}
                height={192}
                unoptimized
                className={styles.image}
              />
            </span>
            <span className={styles.caption}>
              <strong>{seal.title}</strong>
              <small>{seal.description}</small>
            </span>
          </li>
        ))}
      </ul>
      {methods.length > 0 ? <div className={`ck-trust-payments ${styles.payments}`}>
        {methods.includes("pix") ? <span><PixLogo size={17} />Pix</span> : null}
        {methods.includes("card") ? <span><CreditCard size={17} aria-hidden="true" />{maxInstallments > 1 ? `Cartão em até ${maxInstallments}x` : "Cartão de crédito"}</span> : null}
      </div> : null}
    </section>
  );
}
