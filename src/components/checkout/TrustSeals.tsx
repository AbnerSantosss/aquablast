import { CreditCard, MessageCircle, Store, Truck, Undo2 } from "lucide-react";
import type { Theme } from "@/lib/checkout/own/theme";
import { HelpFact, sellerLine, WithdrawalFact, type SupportLink } from "./PaySeals";
import { PixLogo } from "./PixLogo";
import type { PayMethodUi } from "./types";
import styles from "./TrustSeals.module.css";

/**
 * Fatos da compra em texto, com ícone (auditoria de 2026-10-11): substituem os três medalhões de imagem, que não
 * diziam nada verificável. As artes continuam em `public/checkout/selos/`.
 *
 * `payStep`: na etapa de pagamento, vendedor, desistência e ajuda já estão junto do botão de pagar (`PayTrust`,
 * em PaySeals.tsx). Com `payStep` ligado este bloco não repete esses três e fica só com a entrega e as formas de
 * pagamento.
 */
export function TrustSeals({
  methods,
  maxInstallments,
  theme,
  support,
  payStep = false,
}: {
  methods: PayMethodUi[];
  maxInstallments: number;
  theme: Pick<Theme, "storeName" | "companyName" | "companyCnpj">;
  support: SupportLink;
  payStep?: boolean;
}) {
  return (
    <section className={`trust-seals ${styles.panel}`} aria-label="Informações da compra" data-pay-step={payStep || undefined}>
      <ul className={styles.list}>
        {payStep ? null : (
          <li className={styles.fact}>
            <Store aria-hidden="true" />
            <p>Vendido por {sellerLine(theme)}</p>
          </li>
        )}
        <li className={styles.fact}>
          <Truck aria-hidden="true" />
          <p>Entrega rastreada. Acompanhe seu pedido pelo site.</p>
        </li>
        {payStep ? null : (
          <>
            <li className={`${styles.fact} ${styles.withLink}`}>
              <Undo2 aria-hidden="true" />
              <p>
                <WithdrawalFact />
              </p>
            </li>
            <li className={`${styles.fact} ${styles.withLink}`}>
              <MessageCircle aria-hidden="true" />
              <p>
                <HelpFact support={support} />
              </p>
            </li>
          </>
        )}
      </ul>
      {methods.length > 0 ? <div className={`ck-trust-payments ${styles.payments}`}>
        {methods.includes("pix") ? <span><PixLogo size={17} />Pix</span> : null}
        {methods.includes("card") ? <span><CreditCard size={17} aria-hidden="true" />{maxInstallments > 1 ? `Cartão em até ${maxInstallments}x` : "Cartão de crédito"}</span> : null}
      </div> : null}
    </section>
  );
}
