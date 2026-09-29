import { CreditCard, ShieldCheck, Truck, RotateCcw } from "lucide-react";
import { PixLogo } from "./PixLogo";
import type { PayMethodUi } from "./types";

export function TrustSeals({ methods, maxInstallments }: { methods: PayMethodUi[]; maxInstallments: number }) {
  return (
    <section className="trust-seals" aria-label="Garantias da compra">
      <div className="ck-trust-heading"><ShieldCheck size={18} aria-hidden="true" /><h2>Compre com tranquilidade</h2></div>
      <ul>
        <li><ShieldCheck aria-hidden="true" /><span><strong>Compra segura</strong><small>Seus dados protegidos</small></span></li>
        <li><Truck aria-hidden="true" /><span><strong>Entrega acompanhada</strong><small>Código de rastreamento</small></span></li>
        <li><RotateCcw aria-hidden="true" /><span><strong>Devolução em 7 dias</strong><small>A partir do recebimento</small></span></li>
      </ul>
      {methods.length > 0 ? <div className="ck-trust-payments">
        {methods.includes("pix") ? <span><PixLogo size={17} />Pix</span> : null}
        {methods.includes("card") ? <span><CreditCard size={17} aria-hidden="true" />{maxInstallments > 1 ? `Cartão em até ${maxInstallments}x` : "Cartão de crédito"}</span> : null}
      </div> : null}
    </section>
  );
}
