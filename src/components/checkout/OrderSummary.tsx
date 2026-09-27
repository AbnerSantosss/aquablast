import { Check, Truck } from "lucide-react";
import Image from "next/image";
import type { Quote } from "@/lib/checkout/own/pricing";
import { money } from "@/lib/checkout/own/masks";
import type { Selection } from "@/lib/checkout/own/catalog";
import { COLOR_LABELS } from "@/lib/site/constants";
import type { Color } from "@/lib/site/types";
import type { PaidInfo, PayMethodUi } from "./types";

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
 * Resumo do pedido (origem app/checkout.tsx, `aside.order-summary`), mesmas classes e textos. Todo valor vem de
 * `quotes` (servidor, `quoteBoth`) ou do pedido pago (`paid.amountCents`); aqui só se formata. Diferenças
 * permitidas pela tabela 8.6: nome/cor/foto do produto (cores reais da seleção) e valores (Pix e cartão têm
 * preços diferentes no painel, então o total acompanha a forma escolhida).
 */
export function OrderSummary({
  selection,
  bump,
  quotes,
  payView,
  showShipping,
  paid,
}: {
  selection: Selection;
  bump: boolean;
  quotes: { pix: Quote; card: Quote };
  /** Forma em destaque no total (origem `payView`): a paga, a escolhida na etapa 3 ou Pix antes dela. */
  payView: PayMethodUi;
  showShipping: boolean;
  paid?: PaidInfo | null;
}) {
  const q = quotes[payView];
  const isKit = selection.pack === "kit";
  const hasBump = !isKit && bump;
  const total = paid ? paid.amountCents : q.amountCents;
  // Preço da seleção original (sem o bump), como a origem mostra no produto: kit − delta = unidade.
  const basePrice = hasBump ? q.amountCents - q.bumpDeltaCents : q.amountCents;
  const [c1, c2] = selection.colors;

  const installments = paid ? paid.installments : q.installments;
  const per = paid ? Math.round(paid.amountCents / Math.max(1, paid.installments)) : q.installmentCents;

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
            <b>{money(basePrice)}</b>
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
        <div>
          <dt>Subtotal</dt>
          <dd>{money(total)}</dd>
        </div>
        {showShipping ? (
          <div>
            <dt>Entrega</dt>
            <dd className="green">Grátis</dd>
          </div>
        ) : null}
      </dl>
      <div className={`total is-${payView}`} aria-live="polite">
        <span>Valor total:</span>
        {payView === "card" ? (
          <strong>
            <b>
              {installments}x {money(per)}
            </b>
            <small>(ou {money(total)} à vista)</small>
          </strong>
        ) : (
          <strong>
            <b>{money(total)}</b>
            <small>NO PIX</small>
          </strong>
        )}
      </div>
      <p className="ck-sum-note">
        <Truck size={15} aria-hidden="true" />
        Dia das Crianças: envio rápido, com código de rastreamento
      </p>
    </aside>
  );
}
