"use client";

import Image from "next/image";
import { Check, CreditCard } from "lucide-react";
import { ErrorBox } from "./Field";
import { PixLogo } from "./PixLogo";
import { useRef } from "react";
import { money } from "@/lib/checkout/own/masks";
import type { Quote } from "@/lib/checkout/own/pricing";
import type { Color } from "@/lib/site/types";
import { CardPay } from "./CardPay";
import { colorName, thumbOf } from "./OrderSummary";
import { TestModeNote } from "./PaySeals";
import { PixPay } from "./PixPay";
import type { PayMethodUi } from "./types";

/**
 * Etapa 3 — Pagamento (origem app/checkout.tsx, `body(3)`): aviso de modo de teste, order bump e o acordeão
 * Cartão/Pix (`.pay-acc`, cada forma num cartão e só a escolhida aberta), mesmas classes e textos.
 * Diferenças permitidas (tabela 8.6): o aviso de teste só aparece quando o gateway da forma escolhida é
 * `simulado`; o bump repete a cor da 1ª unidade (não existe campo para outra cor) com a foto dessa cor; valores
 * vêm do servidor. Abrir o Cartão com o ponteiro leva o foco ao número do cartão (quem trata é o Checkout).
 */
export function StepPagamento({
  cartToken,
  color,
  canBump,
  bump,
  onBumpChange,
  quotes,
  methods,
  method,
  onMethodChange,
  maxInstallments,
  pixTtlSeconds,
  pixGateway,
  cardGateway,
  cardPublicConfig,
  storeName,
  onPaid,
  onPending,
}: {
  cartToken: string;
  color: Color;
  canBump: boolean;
  bump: boolean;
  onBumpChange: (value: boolean) => void;
  quotes: { pix: Quote; card: Quote };
  methods: PayMethodUi[];
  method: PayMethodUi;
  onMethodChange: (method: PayMethodUi, byPointer: boolean) => void;
  maxInstallments: number;
  pixTtlSeconds: number;
  pixGateway: string | null;
  cardGateway: string | null;
  cardPublicConfig: Record<string, string>;
  storeName: string;
  onPaid: (publicToken: string) => void;
  onPending: (publicToken: string) => void;
}) {
  const pointerPick = useRef(false);
  const q = quotes[method];
  const testMode = (method === "pix" ? pixGateway : cardGateway) === "simulado";
  const hasBump = canBump && bump;

  const options = (
    [
      [
        "card",
        CreditCard,
        "Cartão de crédito",
        quotes.card.installments > 1 ? `${quotes.card.installments}x de ${money(quotes.card.installmentCents)} sem juros` : `${money(quotes.card.amountCents)} à vista no cartão`,
      ],
      ["pix", PixLogo, "Pix", `${money(quotes.pix.amountCents)} à vista · aprovação na hora`],
    ] as const
  ).filter(([id]) => methods.includes(id));

  // Nenhuma forma ligada no painel (ex.: produção sem gateway real): diz isso com clareza em vez de um acordeão vazio.
  if (options.length === 0) {
    return (
      <div className="payment-content">
        <ErrorBox>Pagamento indisponível no momento. Seus dados ficaram salvos: tente de novo em alguns minutos ou fale com a gente pelo rodapé.</ErrorBox>
      </div>
    );
  }

  return (
    <div className="payment-content">
      {testMode ? <TestModeNote /> : null}
      {canBump ? (
        <section className={`order-bump ${hasBump ? "added" : ""}`} aria-label="Oferta opcional: segunda unidade">
          <label className="bump-choice">
            <span className={`ck-checkbox${hasBump ? " is-checked" : ""}`}>
              <input type="checkbox" checked={hasBump} onChange={(e) => onBumpChange(e.target.checked)} />
              {hasBump ? <Check aria-hidden="true" size={15} /> : null}
            </span>
            <span>{hasBump ? "ADICIONADO AO PEDIDO" : "SIM, QUERO ADICIONAR A SEGUNDA UNIDADE"}</span>
          </label>
          <div className="bump-product">
            <Image src={thumbOf(color, 610)} width={92} height={92} alt={`AquaBlast ${colorName(color)}`} />
            <div>
              <em className="bump-tag">OFERTA DO KIT</em>
              <h4>Leve também uma AquaBlast {colorName(color)}</h4>
              <strong className="bump-price">+ {money(q.bumpDeltaCents)}</strong>
              {q.bumpSavingCents > 0 ? <small>Economize {money(q.bumpSavingCents)} em relação à unidade avulsa</small> : null}
            </div>
          </div>
        </section>
      ) : null}
      <div
        className="pay-acc"
        role="radiogroup"
        aria-label="Forma de pagamento"
        onKeyDown={() => {
          pointerPick.current = false;
        }}
      >
        {options.map(([id, Icon, label, hint]) => (
          <div key={id} className={`pay-item${method === id ? " is-open" : ""}`}>
            <label
              className="pay-head"
              onPointerDown={() => {
                pointerPick.current = true;
              }}
            >
              <input
                type="radio"
                name="pay-method"
                value={id}
                checked={method === id}
                onChange={() => {
                  const byPointer = pointerPick.current;
                  pointerPick.current = false;
                  onMethodChange(id, byPointer);
                }}
              />
              <Icon size={21} aria-hidden="true" />
              <span className="pay-label">
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
            </label>
            {method === id ? (
              <div className="pay-body">
                {id === "card" ? (
                  <CardPay
                    cartToken={cartToken}
                    bump={hasBump}
                    amountCents={quotes.card.amountCents}
                    maxInstallments={maxInstallments}
                    gateway={cardGateway}
                    publicConfig={cardPublicConfig}
                    testMode={cardGateway === "simulado"}
                    storeName={storeName}
                    onPending={onPending}
                    onPaid={onPaid}
                  />
                ) : (
                  <PixPay
                    key={`${hasBump ? "kit" : "un"}-${quotes.pix.amountCents}`}
                    cartToken={cartToken}
                    bump={hasBump}
                    amountCents={quotes.pix.amountCents}
                    ttlSeconds={pixTtlSeconds}
                    testMode={pixGateway === "simulado"}
                    storeName={storeName}
                    onPaid={onPaid}
                  />
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
