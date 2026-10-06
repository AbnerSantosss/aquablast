import { CreditCard, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { PixLogo } from "./PixLogo";
import type { PayMethodUi } from "./types";

export function TrustSeals({ methods, maxInstallments }: { methods: PayMethodUi[]; maxInstallments: number }) {
  return (
    <section className="trust-seals" aria-label="Garantias da compra">
      <ul>
        <li><ShieldCheck aria-hidden="true" /><span><strong>Dados protegidos</strong><small>Durante a compra</small></span></li>
        <li><Truck aria-hidden="true" /><span><strong>Entrega rastreada</strong><small>Acompanhe seu pedido</small></span></li>
        <li><RotateCcw aria-hidden="true" /><span><strong>Devolução em 7 dias</strong><small>Após o recebimento</small></span></li>
      </ul>
      {methods.length > 0 ? <div className="ck-trust-payments">
        {methods.includes("pix") ? <span><PixLogo size={17} />Pix</span> : null}
        {methods.includes("card") ? <span><CreditCard size={17} aria-hidden="true" />{maxInstallments > 1 ? `Cartão em até ${maxInstallments}x` : "Cartão de crédito"}</span> : null}
      </div> : null}
    </section>
  );
}
