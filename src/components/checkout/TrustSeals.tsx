import { CreditCard, LockKeyhole, RotateCcw, ScanLine, ShieldCheck, Truck } from "lucide-react";
import type { PayMethodUi } from "./types";

const SEALS = [
  [ShieldCheck, "Compra 100% segura", "Ambiente protegido"],
  [LockKeyhole, "Dados criptografados", "Conexão SSL (HTTPS)"],
  [Truck, "Envio FULL", "Com rastreamento"],
  [RotateCcw, "7 dias para devolução", "Direito de arrependimento"],
] as const;

/**
 * Selos de garantia (origem app/checkout.tsx, `section.trust-seals`), mesmos textos. Nenhum número inventado:
 * "7 dias" é o direito de arrependimento do CDC (art. 49) e as parcelas vêm de `checkout.maxInstallments`.
 * A linha "Formas de pagamento" só lista o que está de fato ligado no painel.
 */
export function TrustSeals({ methods, maxInstallments }: { methods: PayMethodUi[]; maxInstallments: number }) {
  return (
    <section className="trust-seals" aria-label="Garantias da compra">
      <ul>
        {SEALS.map(([Icon, title, text]) => (
          <li key={title}>
            <Icon aria-hidden="true" />
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
          </li>
        ))}
      </ul>
      <div className="pay-methods">
        <span>Formas de pagamento</span>
        {methods.includes("pix") ? (
          <em>
            <ScanLine size={15} aria-hidden="true" />
            Pix
          </em>
        ) : null}
        {methods.includes("card") ? (
          <em>
            <CreditCard size={15} aria-hidden="true" />
            {maxInstallments > 1 ? `Cartão em até ${maxInstallments}x` : "Cartão de crédito"}
          </em>
        ) : null}
      </div>
    </section>
  );
}
