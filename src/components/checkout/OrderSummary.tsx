import { Check, CreditCard, Truck } from "lucide-react";
import Image from "next/image";
import type { Quote } from "@/lib/checkout/own/pricing";
import { money } from "@/lib/checkout/own/masks";
import type { Selection } from "@/lib/checkout/own/catalog";
import { COLOR_LABELS } from "@/lib/site/constants";
import type { Color } from "@/lib/site/types";
import { PixLogo } from "./PixLogo";
import type { PaidInfo, PayMethodUi } from "./types";

/** "preview" = antes de escolher a forma (etapas 1 e 2): parcela em destaque e Pix com desconto logo abaixo. */
export type PayView = PayMethodUi | "preview";

/**
 * O bump (2ª unidade) sempre repete a cor da 1ª: `checkout_carts`/`orders` não têm campo para a cor da 2ª
 * unidade do bump — só `bump: boolean` (order.ts `effectiveSelection`). Por isso não há seletor de cor no bump.
 */
export function effectiveSelectionClient(selection: Selection, bump: boolean): Selection {
  if (selection.pack === "kit") return selection;
  return bump ? { pack: "kit", colors: [selection.colors[0], selection.colors[0]] } : selection;
}

export const colorName = (c: Color) => COLOR_LABELS[c].toLowerCase();
export const thumbOf = (c: Color, size: 110 | 610 = 110) => `/thumbs/produto-${c}-${size}.webp`;

/**
 * Resumo do pedido (origem app/checkout.tsx, `aside.order-summary`). Todo valor vem de `quotes` (servidor,
 * `quoteBoth`) ou do pedido pago (`paid.amountCents`); aqui só se formata. Combinado com o dono em 2026-09-27
 * ([[2026-09-27-preco-parcela-destaque]]): a PARCELA do cartão fica em destaque e o Pix à vista aparece logo
 * abaixo como desconto; só quando o cliente escolhe o Pix na etapa 3 o total do Pix passa a ser o destaque.
 * O desconto do Pix é a diferença entre os dois totais do servidor (nenhum número digitado aqui).
 */
export function OrderSummary({
  selection,
  bump,
  quotes,
  payView,
  cardEnabled,
  pixEnabled,
  paid,
}: {
  selection: Selection;
  bump: boolean;
  quotes: { pix: Quote; card: Quote };
  /** Forma em destaque: a paga, a escolhida na etapa 3 ou "preview" antes dela. */
  payView: PayView;
  /** Cartão/Pix ligados no painel. Com nenhum ligado, mostra os preços mesmo assim (o preço existe; só o pagamento não). */
  cardEnabled: boolean;
  pixEnabled: boolean;
  paid?: PaidInfo | null;
}) {
  const noMethod = !cardEnabled && !pixEnabled;
  const showCard = cardEnabled || noMethod;
  const showPix = pixEnabled || noMethod;
  const view: PayMethodUi = paid ? paid.method : payView === "preview" ? (showCard ? "card" : "pix") : payView;
  const q = quotes[view];
  const card = quotes.card;
  const pix = quotes.pix;
  const isKit = selection.pack === "kit";
  const hasBump = !isKit && bump;
  const total = paid ? paid.amountCents : q.amountCents;
  // Preço da seleção original (sem o bump): kit − delta = unidade.
  const basePrice = hasBump ? q.amountCents - q.bumpDeltaCents : q.amountCents;
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
                {money(q.amountCents + q.bumpSavingCents)}
              </s>
            ) : null}
            <b>{productPrice}</b>
          </div>
          {isKit && q.bumpSavingCents > 0 ? <em className="save-tag">ECONOMIZE {money(q.bumpSavingCents)}</em> : null}
        </div>
      </div>
      {hasBump ? (
        <div className="bump-summary">
          <span>
            <Check size={15} aria-hidden="true" /> + 1 AquaBlast {colorName(c1)}
          </span>
          <b>{money(q.bumpDeltaCents)}</b>
        </div>
      ) : null}
      <dl className="price-details">
        {hasBump ? (
          <div>
            <dt>Subtotal</dt>
            <dd>{money(total)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Entrega</dt>
          <dd className="green">Grátis</dd>
        </div>
      </dl>
      <div className={`total is-${view}`} aria-live="polite">
        <span>Valor total</span>
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
            <small>à vista no Pix</small>
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
      {!paid && view === "pix" && showCard && card.installments > 1 ? (
        <p className="total-alt">
          <CreditCard size={17} aria-hidden="true" />
          <span>
            ou <b>{card.installments}x de {money(card.installmentCents)}</b> sem juros no cartão
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
