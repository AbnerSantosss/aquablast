"use client";

import Image from "next/image";
import { Check, CreditCard } from "lucide-react";
import { ErrorBox } from "./Field";
import { PixLogo } from "./PixLogo";
import { useRef, useState, type ReactNode } from "react";
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
import styles from "./StepPagamento.module.css";

/**
 * Etapa 3 - Pagamento: cada método tem um rádio e só o escolhido fica aberto. A ordem visual é
 * Cartão/Pix; o método padrão continua vindo do Checkout. A oferta opcional fica antes do botão de pagar.
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
  paymentSync = "idle",
  onRetrySync,
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
  paymentSync?: "idle" | "saving" | "error";
  onRetrySync?: () => void;
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
  const paymentRef = useRef<HTMLFieldSetElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [confirmedColor, setConfirmedColor] = useState<Color | null>(bumpColor);
  const selectionPending = hasBump && (!bumpColor || confirmedColor !== bumpColor);
  const [nudged, setNudged] = useState(false);

  // Pix/cartão clicados sem a cor da 2ª unidade: leva o cliente até a escolha, sem cobrar nada.
  function requireColor() {
    setNudged(true);
    const box = colorsRef.current;
    if (!box) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
    if (missingColor) box.querySelector<HTMLInputElement>("input[type=radio]")?.focus({ preventScroll: true });
    else confirmRef.current?.focus({ preventScroll: true });
  }
  function confirmSecondUnit() {
    if (!bumpColor) return;
    setConfirmedColor(bumpColor);
    setNudged(false);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    paymentRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    paymentRef.current?.querySelector<HTMLInputElement>('input[name="pay-method"]:checked')?.focus({ preventScroll: true });
  }
  function continueWithOneUnit() {
    setConfirmedColor(null);
    setNudged(false);
    onBumpChange(false);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    paymentRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  }
  const shown = hasBump && bumpColor ? bumpColor : color;
  const pixSavingCents = Math.max(0, quotes.card.amountCents - quotes.pix.amountCents);

  // A oferta usa o mesmo estado ao alternar a forma de pagamento; fica junto do botão de pagar.
  const bumpOffer: ReactNode = canBump ? (
    <section className={`${styles.bump} order-bump${hasBump ? " added" : ""}${missingColor ? " needs-color" : ""}${missingColor && nudged ? " is-nudged" : ""}`} aria-label="Oferta opcional: segunda unidade">
      {!hasBump ? (
        <button
          type="button"
          className="bump-open-trigger"
          aria-label="Quero aproveitar o desconto na segunda unidade"
          aria-expanded={false}
          onClick={() => { setNudged(false); setConfirmedColor(null); onBumpChange(true); }}
        />
      ) : null}
      <div className={`${styles.bumpProduct} bump-product`}>
        <label className={`${styles.bumpChoice} bump-choice`}>
          <span className={`ck-checkbox${hasBump ? " is-checked" : ""}`}>
            <input
              type="checkbox"
              checked={hasBump}
              tabIndex={hasBump ? undefined : -1}
              onChange={(e) => {
                setNudged(false);
                setConfirmedColor(null);
                onBumpChange(e.target.checked);
              }}
            />
            {hasBump ? <Check aria-hidden="true" size={15} /> : null}
          </span>
          <span className={styles.srOnly}>{hasBump ? selectionPending ? "ESCOLHA SUA SEGUNDA UNIDADE" : "SEGUNDA UNIDADE SELECIONADA" : "QUERO APROVEITAR O DESCONTO"}</span>
        </label>
        <Image className={styles.bumpPhoto} src={thumbOf(shown, 610)} width={56} height={56} alt={hasBump && bumpColor ? `2ª AquaBlast ${colorName(bumpColor)}` : "AquaBlast"} />
        <div className={styles.bumpCopy}>
          <em className={`${styles.bumpTag} bump-tag`}>Oferta opcional para seu pedido</em>
          <h4>Leve a segunda unidade com desconto</h4>
          <strong className={`${styles.bumpPrice} bump-price`}>+ {money(q.bumpDeltaCents)}</strong>
          {q.bumpSavingCents > 0 ? <small>Economize {money(q.bumpSavingCents)} em relação à unidade avulsa</small> : null}
        </div>
      </div>
      {hasBump ? (
        <div className={`${styles.bumpColors} bump-colors`} ref={colorsRef}>
          <p className="bump-colors-title" id="bump-color-title">Escolha a cor da sua segunda AquaBlast</p>
          <p className="bump-colors-help">Toque em uma cor e confirme sua escolha abaixo.</p>
          <div className="bump-color-options" role="radiogroup" aria-labelledby="bump-color-title" aria-required="true" aria-invalid={missingColor || undefined} aria-describedby="bump-color-alert">
            {COLOR_KEYS.map((c) => (
              <label key={c} className={`bump-color${bumpColor === c ? " is-selected" : ""}`}>
                <input type="radio" name="bump-color" value={c} checked={bumpColor === c} onChange={() => { setConfirmedColor(null); setNudged(false); onBumpColorChange(c); }} />
                <Image src={thumbOf(c)} width={36} height={36} alt="" />
                <span>{COLOR_LABELS[c]}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <p className={`${styles.bumpAlert} bump-color-alert`} id="bump-color-alert" aria-live="polite">
        {missingColor && nudged ? "Escolha uma cor para continuar." : selectionPending && nudged ? "Confirme a segunda unidade para continuar." : ""}
      </p>
      {hasBump ? (
        <div className={`${styles.bumpConfirm} bump-confirm`}>
          {selectionPending ? (
            <button ref={confirmRef} type="button" className={`primary-button${bumpColor ? " is-ready" : ""}`} disabled={!bumpColor} onClick={confirmSecondUnit}>
              Selecionar segunda unidade com desconto
            </button>
          ) : <p role="status"><Check size={15} aria-hidden="true" />Segunda unidade {colorName(bumpColor!)} selecionada</p>}
          <button type="button" className="bump-skip" onClick={continueWithOneUnit}>Continuar só com 1 unidade</button>
        </div>
      ) : null}
    </section>
  ) : null;

  const options = (
    [
      [
        "card",
        CreditCard,
        "Cartão de crédito",
        quotes.card.installments > 1 ? `${quotes.card.installments}x de ${money(quotes.card.installmentCents)} sem juros` : `${money(quotes.card.amountCents)} à vista no cartão`,
      ],
      ["pix", PixLogo, pixSavingCents > 0 ? "Pix com desconto" : "Pix", `${money(quotes.pix.amountCents)} à vista`],
    ] as const
  ).filter(([id]) => methods.includes(id));

  // Nenhuma forma ligada no painel (ex.: produção sem gateway real): diz isso com clareza em vez de um acordeão vazio.
  if (options.length === 0) {
    return (
      <div className={`${styles.payment} payment-content`}>
        <ErrorBox>Pagamento indisponível no momento. Seus dados ficaram salvos: tente de novo em alguns minutos ou fale com a gente pelo rodapé.</ErrorBox>
      </div>
    );
  }

  return (
    <div className={`${styles.payment} payment-content`}>
      {testMode ? <TestModeNote /> : null}
      {paymentSync !== "idle" ? <p className="ck-payment-sync" role="status">
        {paymentSync === "saving" ? "Atualizando o total do pedido…" : <>Não foi possível atualizar o total. <button type="button" onClick={onRetrySync}>Tentar novamente</button></>}
      </p> : null}
      <fieldset
        disabled={paymentSync !== "idle"}
        aria-busy={paymentSync === "saving" || undefined}
        className={`${styles.methods} pay-acc`}
        ref={paymentRef}
        role="radiogroup"
        aria-label="Forma de pagamento"
        onKeyDown={() => {
          pointerPick.current = false;
        }}
      >
        {options.map(([id, Icon, label, hint]) => (
          <div key={id} className={`${styles.method} pay-item pay-item-${id}${method === id ? " is-open" : ""}`}>
            <label
              className={`${styles.methodHead} pay-head`}
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
              <span className={`${styles.methodLabel} pay-label`}>
                <strong>{label}</strong>
                <small>{id === "pix" && method === "pix" ? "Pagamento pelo app do seu banco" : hint}</small>
              </span>
              {id === "pix" && pixSavingCents > 0 ? <em className={`${styles.saving} ck-pix-saving`}>Economize {money(pixSavingCents)}</em> : null}
            </label>
            {method === id ? (
              <div className={`${styles.methodBody} pay-body`}>
                {id === "card" && cardPending ? (
                  <>{bumpOffer}<CardPending pixCents={quotes.pix.amountCents} cardCents={quotes.card.amountCents} onPix={() => onMethodChange("pix", false)} /></>
                ) : id === "card" ? (
                  <CardPay
                    cartToken={cartToken}
                    bump={hasBump}
                    bumpColor={bumpColor}
                    blocked={selectionPending}
                    onBlocked={requireColor}
                    beforeSubmit={bumpOffer}
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
                    blocked={selectionPending}
                    onBlocked={requireColor}
                    beforeSubmit={bumpOffer}
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
      </fieldset>
    </div>
  );
}
