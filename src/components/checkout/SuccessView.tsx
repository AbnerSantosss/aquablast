import { Check } from "lucide-react";
import { money } from "@/lib/checkout/own/masks";

/**
 * Confirmação (origem app/simulated-payment.tsx, `.ck-success`) — adaptada para o pedido real: sem o
 * botão "Fazer novo teste" (só existe na demo) e com "Enviamos" no presente, já que o pedido está
 * pago/registrado de verdade. Props em formato já pronto para exibir (título, variante, endereço em
 * uma linha) para servir tanto o fluxo ao vivo (Checkout.tsx, a partir de `Selection`/`AddressData`)
 * quanto a página /checkout/pedido/[token] (a partir da linha do banco, `orders`).
 */
export function SuccessView({
  orderNumber,
  itemTitle,
  itemVariant,
  addressLine,
  email,
  paymentLabel,
  amountCents,
  testMode,
}: {
  orderNumber: string;
  itemTitle: string;
  itemVariant: string;
  addressLine: string;
  email: string;
  paymentLabel: string;
  amountCents: number;
  testMode: boolean;
}) {
  return (
    <section className="ck-success" role="status" aria-labelledby="ck-success-title">
      <div className="ck-success-icon" aria-hidden="true">
        <Check size={30} strokeWidth={3} />
      </div>
      <h2 id="ck-success-title">Pedido confirmado!</h2>
      <p className="ck-success-order">
        Pedido nº <strong>{orderNumber}</strong>
      </p>

      {testMode ? <p className="ck-testmode">Modo de teste: nenhuma cobrança real foi feita.</p> : null}

      <dl className="ck-success-list">
        <div>
          <dt>Pagamento</dt>
          <dd>{paymentLabel}</dd>
        </div>
        <div>
          <dt>Item</dt>
          <dd>
            <span>{itemTitle}</span>
            <small>{itemVariant}</small>
          </dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>
            <strong>{money(amountCents)}</strong>
          </dd>
        </div>
        <div>
          <dt>Entrega</dt>
          <dd>
            <span>{addressLine}</span>
            <small>Frete FULL grátis · Com código de rastreamento</small>
          </dd>
        </div>
        <div>
          <dt>Confirmação</dt>
          <dd>
            Enviamos a confirmação para <strong>{email}</strong>
          </dd>
        </div>
      </dl>
    </section>
  );
}
