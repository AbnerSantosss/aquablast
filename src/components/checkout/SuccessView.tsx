"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { TestModeNote } from "./PaySeals";

/**
 * Confirmação (origem app/simulated-payment.tsx, `SuccessView`), mesmas classes e textos, dentro do `.ck-flow`
 * acima das etapas concluídas. Diferenças da origem: "Enviamos" no lugar de "Enviaríamos" (o pedido é real) e o
 * aviso de modo de teste + o botão "Fazer novo teste" só aparecem com o gateway `simulado` (plano 8.6).
 * O título recebe o foco ao montar, como na origem.
 */
export function SuccessView({
  orderNumber,
  payment,
  items,
  total,
  address,
  email,
  testMode,
  restartHref,
}: {
  orderNumber: string;
  payment: string;
  items: string[];
  total: string;
  address: string;
  email: string;
  testMode: boolean;
  restartHref: string;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  return (
    <section className="ck-success" role="status" aria-labelledby="ck-success-title">
      <div className="ck-success-icon" aria-hidden="true">
        <Check size={30} strokeWidth={3} />
      </div>
      <h2 id="ck-success-title" ref={title} tabIndex={-1}>
        Pedido confirmado!
      </h2>
      <p className="ck-success-order">
        Pedido nº <strong>{orderNumber}</strong>
      </p>
      {testMode ? <TestModeNote /> : null}
      <dl className="ck-success-list">
        <div>
          <dt>Pagamento</dt>
          <dd>{payment}</dd>
        </div>
        <div>
          <dt>Itens</dt>
          <dd>
            {items.map((i) => (
              <span key={i}>{i}</span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>
            <strong>{total}</strong>
          </dd>
        </div>
        <div>
          <dt>Entrega</dt>
          <dd>
            <span>{address}</span>
            <small>Frete grátis · Com código de rastreamento</small>
          </dd>
        </div>
        <div>
          <dt>Confirmação</dt>
          <dd>
            Enviamos a confirmação para <strong>{email}</strong>
          </dd>
        </div>
      </dl>
      {testMode ? (
        <Link className="primary-button ck-pay-btn" href={restartHref}>
          Fazer novo teste
        </Link>
      ) : null}
    </section>
  );
}
