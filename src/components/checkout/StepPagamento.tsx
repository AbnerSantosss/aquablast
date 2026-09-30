"use client";

import Image from "next/image";
import { Check, CreditCard } from "lucide-react";
import { ErrorBox } from "./Field";
import { PixLogo } from "./PixLogo";
import { useRef, useState } from "react";
import { money } from "@/lib/checkout/own/masks";
import type { Quote } from "@/lib/checkout/own/pricing";
import { COLOR_KEYS, COLOR_LABELS } from "@/lib/site/constants";
import type { Color } from "@/lib/site/types";
import { CardPay } from "./CardPay";
import { CardPending } from "./CardPending";
import { colorName, thumbOf } from "./OrderSummary";
import { TestModeNote } from "./PaySeals";
import { PixPay } from "./PixPay";
import type { PayMethodUi } from "./types";

/**
 * Etapa 3 — Pagamento (origem app/checkout.tsx, `body(3)`): aviso de modo de teste, order bump e o acordeão
 * Cartão/Pix (`.pay-acc`, cada forma num cartão e só a escolhida aberta), mesmas classes e textos.
 * Diferenças permitidas (tabela 8.6): o aviso de teste só aparece quando o gateway da forma escolhida é
 * `simulado`; valores vêm do servidor. Abrir o Cartão com o ponteiro leva o foco ao número do cartão (quem trata
 * é o Checkout).
 *
 * Bump (pedido do dono, 2026-09-30): "Leve também a 2ª AquaBlast" sem citar a cor da 1ª. Ao marcar aparece a
 * escolha da cor da 2ª unidade (radios nativos, alvo >= 44 px), SEM cor pré-escolhida. Sem cor: o bump fica em
 * destaque com "Escolha a cor para continuar" (aria-live) e Pix/cartão não cobram — clicar neles rola até o bump
 * e foca a 1ª cor. Com cor, a miniatura vira a foto dessa cor. Desmarcar limpa a cor (o Checkout cuida).
 */
export function StepPagamento({
  cartToken,
  color,
  canBump,
  bump,
  onBumpChange,
  bumpColor,
  onBumpColorChange,
  quotes,
  coupon,
  methods,
  method,
  onMethodChange,
  maxInstallments,
  pixTtlSeconds,
  pixGateway,
  cardGateway,
  cardPublicConfig,
  cardPending = false,
  storeName,
  onPaid,
  onPending,
}: {
  cartToken: string;
  color: Color;
  canBump: boolean;
  bump: boolean;
  onBumpChange: (value: boolean) => void;
  bumpColor: Color | null;
  onBumpColorChange: (color: Color) => void;
  quotes: { pix: Quote; card: Quote };
  coupon: string;
  methods: PayMethodUi[];
  method: PayMethodUi;
  onMethodChange: (method: PayMethodUi, byPointer: boolean) => void;
  maxInstallments: number;
  pixTtlSeconds: number;
  pixGateway: string | null;
  cardGateway: string | null;
  cardPublicConfig: Record<string, string>;
  cardPending?: boolean;
  storeName: string;
  onPaid: (publicToken: string) => void;
  onPending: (publicToken: string) => void;
}) {
  const pointerPick = useRef(false);
  const q = quotes[method];
  const testMode = (method === "pix" ? pixGateway : cardGateway) === "simulado";
  const hasBump = canBump && bump;
  const missingColor = hasBump && !bumpColor;
  const colorsRef = useRef<HTMLDivElement>(null);
  const [nudged, setNudged] = useState(false);

  // Pix/cartão clicados sem a cor da 2ª unidade: leva o cliente até a escolha, sem cobrar nada.
  function requireColor() {
    setNudged(true);
    const box = colorsRef.current;
    if (!box) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
    box.querySelector<HTMLInputElement>("input[type=radio]")?.focus({ preventScroll: true });
  }
  const shown = hasBump && bumpColor ? bumpColor : color;

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
        <section className={`order-bump${hasBump ? " added" : ""}${missingColor ? " needs-color" : ""}${missingColor && nudged ? " is-nudged" : ""}`} aria-label="Oferta opcional: segunda unidade">
          <label className="bump-choice">
            <span className={`ck-checkbox${hasBump ? " is-checked" : ""}`}>
              <input
                type="checkbox"
                checked={hasBump}
                onChange={(e) => {
                  setNudged(false);
                  onBumpChange(e.target.checked);
                }}
              />
              {hasBump ? <Check aria-hidden="true" size={15} /> : null}
            </span>
            <span>{hasBump ? "ADICIONADO AO PEDIDO" : "SIM, QUERO ADICIONAR A SEGUNDA UNIDADE"}</span>
          </label>
          <div className="bump-product">
            <Image src={thumbOf(shown, 610)} width={92} height={92} alt={hasBump && bumpColor ? `2ª AquaBlast ${colorName(bumpColor)}` : "AquaBlast"} />
            <div>
              <em className="bump-tag">OFERTA DO KIT</em>
              <h4>Leve também a 2ª AquaBlast</h4>
              <strong className="bump-price">+ {money(q.bumpDeltaCents)}</strong>
              {q.bumpSavingCents > 0 ? <small>Economize {money(q.bumpSavingCents)} em relação à unidade avulsa</small> : null}
            </div>
          </div>
          {hasBump ? (
            <div className="bump-colors" ref={colorsRef}>
              <p className="bump-colors-title" id="bump-color-title">
                Escolha a cor da 2ª unidade:
              </p>
              <div className="bump-color-options" role="radiogroup" aria-labelledby="bump-color-title" aria-required="true" aria-invalid={missingColor || undefined} aria-describedby="bump-color-alert">
                {COLOR_KEYS.map((c) => (
                  <label key={c} className={`bump-color${bumpColor === c ? " is-selected" : ""}`}>
                    <input type="radio" name="bump-color" value={c} checked={bumpColor === c} onChange={() => onBumpColorChange(c)} />
                    <Image src={thumbOf(c)} width={36} height={36} alt="" />
                    <span>{COLOR_LABELS[c]}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <p className="bump-color-alert" id="bump-color-alert" aria-live="polite">
            {missingColor ? "Escolha a cor para continuar" : ""}
          </p>
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
                {id === "card" && cardPending ? (
                  <CardPending pixCents={quotes.pix.amountCents} cardCents={quotes.card.amountCents} onPix={() => onMethodChange("pix", false)} />
                ) : id === "card" ? (
                  <CardPay
                    cartToken={cartToken}
                    bump={hasBump}
                    bumpColor={bumpColor}
                    blocked={missingColor}
                    onBlocked={requireColor}
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
                    key={`${hasBump ? `kit-${bumpColor ?? "sem-cor"}` : "un"}-${quotes.pix.amountCents}`}
                    cartToken={cartToken}
                    bump={hasBump}
                    bumpColor={bumpColor}
                    blocked={missingColor}
                    onBlocked={requireColor}
                    coupon={coupon}
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
