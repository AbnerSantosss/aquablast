import { ShieldCheck } from "lucide-react";
import Image from "next/image";
import type { Quote } from "@/lib/checkout/own/pricing";
import { money } from "@/lib/checkout/own/masks";
import type { Selection } from "@/lib/checkout/own/catalog";
import { titleOf, variantOf } from "@/lib/checkout/own/catalog";
import { KIT_PHOTO, productPhoto } from "@/lib/site/constants";
import type { PayMethodUi } from "./types";

/**
 * Resumo do pedido (origem app/checkout.tsx, `.order-summary`). Todo valor vem de `quotes` (calculado no
 * servidor por `quoteBoth`, @/lib/checkout/own/pricing) — o navegador nunca calcula preço, só formata
 * (`money`) e divide `installmentCents`/`amountCents` para exibir, igual à origem (`per(n)`).
 *
 * O bump (2ª unidade) sempre repete a cor da 1ª: o `checkout_carts`/`orders` gravado pelo agente
 * apis-seguranca (order.ts `effectiveSelection`) não tem um campo para a cor da 2ª unidade do bump —
 * só existe `bump: boolean`. Por isso aqui (e em StepPagamento/OrderBump) não há seletor de cor para o
 * bump, diferente do que a Fase 8.6 do plano previa: o dado para isso não existe de ponta a ponta.
 */
export function effectiveSelectionClient(selection: Selection, bump: boolean): Selection {
  if (selection.pack === "kit") return selection;
  return bump ? { pack: "kit", colors: [selection.colors[0], selection.colors[0]] } : selection;
}

export function OrderSummary({
  selection,
  bump,
  quotes,
  method,
}: {
  selection: Selection;
  bump: boolean;
  quotes: { pix: Quote; card: Quote };
  method: PayMethodUi;
}) {
  const effective = effectiveSelectionClient(selection, bump);
  const photo = effective.pack === "kit" ? KIT_PHOTO : productPhoto(effective.colors[0]);
  const q = quotes[method];
  const pixSavingCents = quotes.card.amountCents - quotes.pix.amountCents;
  const pixIsCheaper = pixSavingCents > 0;

  return (
    <aside className="ck-card order-summary">
      <h2 className="ck-sum-title">Resumo do pedido</h2>
      <div className="selected-product">
        <Image src={photo.src} alt={photo.alt} width={80} height={80} />
        <div>
          <h4>{titleOf(effective)}</h4>
          <p>{variantOf(effective)}</p>
        </div>
      </div>

      {bump && q.bumpSavingCents > 0 ? (
        <div className="bump-summary">
          <span>
            <ShieldCheck aria-hidden="true" size={15} /> Kit com 2 unidades
          </span>
          <span>Economia de {money(q.bumpSavingCents)}</span>
        </div>
      ) : null}

      <dl className="price-details">
        <div>
          <dt>{method === "pix" ? "Pix" : `Cartão em ${q.installments}x`}</dt>
          <dd>{money(q.amountCents)}</dd>
        </div>
        {pixIsCheaper && method === "card" ? (
          <div>
            <dt>No Pix</dt>
            <dd className="green">{money(quotes.pix.amountCents)}</dd>
          </div>
        ) : null}
      </dl>

      <div className={`total${method === "pix" ? " is-pix" : ""}`}>
        <span>Total</span>
        <strong>
          <b>{money(q.amountCents)}</b>
          {method === "card" && q.installments > 1 ? <small>{q.installments}x de {money(q.installmentCents)} sem juros</small> : null}
          {method === "pix" ? <small>À VISTA NO PIX</small> : null}
        </strong>
      </div>

      {pixIsCheaper && method === "card" ? (
        <p className="ck-sum-note">
          <ShieldCheck aria-hidden="true" size={16} />
          Pagando no Pix você economiza {money(pixSavingCents)}.
        </p>
      ) : null}
    </aside>
  );
}
