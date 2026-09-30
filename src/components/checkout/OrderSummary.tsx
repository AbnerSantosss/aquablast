import { Check, CreditCard, Truck } from "lucide-react";
import Image from "next/image";
import type { Quote } from "@/lib/checkout/own/pricing";
import { money } from "@/lib/checkout/own/masks";
import type { Selection } from "@/lib/checkout/own/catalog";
import { COLOR_LABELS } from "@/lib/site/constants";
import type { Color } from "@/lib/site/types";
import { PixLogo } from "./PixLogo";
import { CouponField } from "./CouponField";
import type { PaidInfo, PayMethodUi } from "./types";

/** Antes da etapa de pagamento, o Pix fica em destaque; depois, respeita a forma escolhida. */
export type PayView = PayMethodUi | "preview";

/**
 * Seleção que a tela mostra. Unidade + bump vira kit com a cor que o cliente escolheu para a 2ª unidade
 * (gravada em `checkout_carts.colors[1]`, lida por order.ts `effectiveSelection`). Bump marcado ainda sem cor
 * continua mostrando só a 1ª unidade: a cor da 2ª é obrigatória antes de pagar (2026-09-30).
 */
export function effectiveSelectionClient(selection: Selection, bump: boolean, bumpColor: Color | null = null): Selection {
  if (selection.pack === "kit") return selection;
  return bump && bumpColor ? { pack: "kit", colors: [selection.colors[0], bumpColor] } : selection;
}

export const colorName = (c: Color) => COLOR_LABELS[c].toLowerCase();
export const thumbOf = (c: Color, size: 110 | 610 = 110) => `/thumbs/produto-${c}-${size}.webp`;

/**
 * Resumo do pedido (origem app/checkout.tsx, `aside.order-summary`). Todo valor vem de `quotes` (servidor,
 * `quoteBoth`) ou do pedido pago (`paid.amountCents`); aqui só se formata. O Pix fica em destaque na prévia,
 * com o benefício acima do total e o parcelamento abaixo. Na etapa 3 respeita a forma escolhida.
 * O desconto do Pix é a diferença entre os dois totais do servidor (nenhum número digitado aqui).
 */
export function OrderSummary({
  selection,
  bump,
  bumpColor = null,
  quotes,
  payView,
  cardEnabled,
  pixEnabled,
  paid,
  coupon = "",
  couponBusy = false,
  onCouponApply,
}: {
  selection: Selection;
  bump: boolean;
  /** Cor da 2ª unidade do bump; null enquanto o cliente não escolheu. */
  bumpColor?: Color | null;
  quotes: { pix: Quote; card: Quote };
  /** Forma em destaque: a paga, a escolhida na etapa 3 ou "preview" antes dela. */
  payView: PayView;
  /** Cartão/Pix ligados no painel. Com nenhum ligado, mostra os preços mesmo assim (o preço existe; só o pagamento não). */
  cardEnabled: boolean;
  pixEnabled: boolean;
  paid?: PaidInfo | null;
  coupon?: string;
  couponBusy?: boolean;
  onCouponApply?: (code: string) => Promise<string | null>;
}) {
  const noMethod = !cardEnabled && !pixEnabled;
  const showCard = cardEnabled || noMethod;
  const showPix = pixEnabled || noMethod;
  const view: PayMethodUi = paid ? paid.method : payView === "preview" ? (showPix ? "pix" : "card") : payView;
  const q = quotes[view];
  const card = quotes.card;
  const pix = quotes.pix;
  const isKit = selection.pack === "kit";
  const hasBump = !isKit && bump;
  const total = paid ? paid.amountCents : q.amountCents;
  // Cupom de teste: o total já vem com desconto do servidor; o produto mostra o preço de tabela e o desconto vira linha própria.
  const couponOff = paid ? 0 : q.couponDiscountCents;
  const listTotal = q.amountCents + couponOff;
  // Preço da seleção original (sem o bump): kit − delta = unidade.
  const basePrice = hasBump ? listTotal - q.bumpDeltaCents : listTotal;
  const pixSaving = card.amountCents - pix.amountCents;
  const [c1, c2] = selection.colors;

  const installments = paid ? paid.installments : card.installments;
  const per = paid ? Math.round(paid.amountCents / Math.max(1, paid.installments)) : card.installmentCents;
  const productPrice =
    view === "card" && !hasBump && card.installments > 1 ? `${card.installments}x de ${money(card.installmentCents)}` : money(basePrice);

  return (
    <aside className="ck-card order-summary" aria-label="Resumo do pedido">
      <h2 className="ck-sum-title">Resumo do pedido</h2>
      <div className="selected-product">
        {isKit ? (
          <span className="ck-kit-thumbs">
            <Image src={thumbOf(c1)} width={40} height={80} alt={`AquaBlast ${colorName(c1)}`} />
            <Image src={thumbOf(c2 ?? c1)} width={40} height={80} alt={`AquaBlast ${colorName(c2 ?? c1)}`} />
          </span>
        ) : (
          <Image src={thumbOf(c1)} width={80} height={80} alt={`AquaBlast ${colorName(c1)}`} />
        )}
        <div>
          <h4>{isKit ? "Kit com 2 AquaBlast" : "1 unidade AquaBlast"}</h4>
          <p>{isKit ? `1 ${colorName(c1)} + 1 ${colorName(c2 ?? c1)}` : `Cor ${colorName(c1)}`}</p>
          <div className="offer">
            {isKit && q.bumpSavingCents > 0 ? (
              <s>
                <span className="ck-u-sr-only">De </span>
                {money(listTotal + q.bumpSavingCents)}
              </s>
            ) : null}
            <b>{productPrice}</b>
          </div>
          {isKit && q.bumpSavingCents > 0 ? <em className="save-tag">ECONOMIZE {money(q.bumpSavingCents)}</em> : null}
        </div>
      </div>
      {!paid && showPix && onCouponApply ? (
        <CouponField coupon={coupon} applied={!!coupon && pix.couponDiscountCents > 0} busy={couponBusy} onApply={onCouponApply} />
      ) : null}
      {hasBump ? (
        <div className="bump-summary">
          <span>
            <Check size={15} aria-hidden="true" /> + 1 AquaBlast {bumpColor ? colorName(bumpColor) : "· cor a escolher"}
          </span>
          <b>{money(q.bumpDeltaCents)}</b>
        </div>
      ) : null}
      <dl className="price-details">
        {hasBump ? (
          <div>
            <dt>Subtotal</dt>
            <dd>{money(couponOff > 0 ? listTotal : total)}</dd>
          </div>
        ) : null}
        {couponOff > 0 ? (
          <div>
            <dt>Desconto do cupom no Pix</dt>
            <dd className="green">− {money(couponOff)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Entrega</dt>
          <dd className="green">Grátis</dd>
        </div>
      </dl>
      <div className={`total is-${view}`} aria-live="polite">
        <div className="ck-total-heading">
          <span>{view === "pix" ? <PixLogo size={20} /> : <CreditCard size={20} aria-hidden="true" />}{view === "pix" ? "À vista no Pix" : "Total no cartão"}</span>
          {!paid && view === "pix" && showCard && pixSaving > 0 ? <em>Economize {money(pixSaving)}</em> : null}
        </div>
        {view === "card" ? (
          <strong>
            <b>
              {installments}x de {money(per)}
            </b>
            <small>
              sem juros no cartão · total {money(total)}
            </small>
          </strong>
        ) : (
          <strong>
            <b>{money(total)}</b>
            <small>{paid ? "Valor pago" : "Valor total · frete grátis"}</small>
          </strong>
        )}
      </div>
      {!paid && view === "card" && showPix ? (
        <p className="total-alt is-pix">
          <PixLogo size={17} />
          <span>
            ou <b>{money(pix.amountCents)}</b> à vista no Pix
          </span>
          {pixSaving > 0 ? <em>{money(pixSaving)} de desconto</em> : null}
        </p>
      ) : null}
      {!paid && view === "pix" && showCard ? (
        <p className="total-alt">
          <CreditCard size={17} aria-hidden="true" />
          <span>
            {card.installments > 1 ? <>ou <b>{card.installments}x de {money(card.installmentCents)}</b> sem juros no cartão</> : <>ou <b>{money(card.amountCents)}</b> à vista no cartão</>}
            <small>Total no cartão: {money(card.amountCents)}</small>
          </span>
        </p>
      ) : null}
      <p className="ck-sum-note">
        <Truck size={15} aria-hidden="true" />
        Dia das Crianças: envio rápido, com código de rastreamento
      </p>
    </aside>
  );
}
