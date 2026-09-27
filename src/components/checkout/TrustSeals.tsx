import { CreditCard, Lock, QrCode, ShieldCheck, Truck } from "lucide-react";

/**
 * Selos de confiança (grid ".trust-seals", origem app/checkout.tsx). Conteúdo fixo, sem número inventado
 * (regra dura #2): "Compra 100% segura" e "Dados protegidos" descrevem o próprio checkout (HTTPS +
 * criptografia), não uma métrica de terceiros.
 */
export function TrustSeals() {
  return (
    <section className="ck-card trust-seals" aria-label="Selos de confiança">
      <ul>
        <li>
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>Compra 100% segura</strong>
            <small>Conexão criptografada</small>
          </span>
        </li>
        <li>
          <Truck aria-hidden="true" />
          <span>
            <strong>Frete grátis</strong>
            <small>Para todo o Brasil</small>
          </span>
        </li>
        <li>
          <Lock aria-hidden="true" />
          <span>
            <strong>Dados protegidos</strong>
            <small>Nunca compartilhados</small>
          </span>
        </li>
        <li>
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>Garantia AquaBlast</strong>
            <small>Suporte pelo WhatsApp</small>
          </span>
        </li>
      </ul>
      <div className="pay-methods">
        <em>
          <QrCode aria-hidden="true" /> Pix
        </em>
        <em>
          <CreditCard aria-hidden="true" /> Cartão de crédito
        </em>
      </div>
    </section>
  );
}
