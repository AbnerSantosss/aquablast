import { Check, ChevronDown, CreditCard, ShoppingBag, Truck } from "lucide-react";
import Image from "next/image";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import type { Quote } from "@/lib/checkout/own/pricing";
import { money } from "@/lib/checkout/own/masks";
import type { Selection } from "@/lib/checkout/own/catalog";
import { COLOR_LABELS } from "@/lib/site/constants";
import type { Color } from "@/lib/site/types";
import { PixLogo } from "./PixLogo";
import { CouponField } from "./CouponField";
import type { PaidInfo, PayMethodUi } from "./types";
import styles from "./OrderSummary.module.css";

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

const SUMMARY_MOBILE_QUERY = "(max-width: 1099px)";
function subscribeSummaryViewport(onChange: () => void) {
  const media = window.matchMedia(SUMMARY_MOBILE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const summaryMobileSnapshot = () => window.matchMedia(SUMMARY_MOBILE_QUERY).matches;
const summaryServerSnapshot = () => true;

/** A manual disclosure choice survives quote updates and viewport changes. */
export function summaryIsExpanded(choice: boolean | null, mobile: boolean, paid: boolean) {
  return choice ?? (paid || !mobile);
}

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
  deliveryPromise = null,
  selectionEditor,
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
  /** Aviso de entrega com data limite (lib/site/delivery-promise.ts), decidido no servidor; null depois da data. */
  deliveryPromise?: string | null;
  selectionEditor?: ReactNode;
}) {
  const [expandedChoice, setExpanded] = useState<boolean | null>(null);
  const summaryMobile = useSyncExternalStore(subscribeSummaryViewport, summaryMobileSnapshot, summaryServerSnapshot);
  const expanded = summaryIsExpanded(expandedChoice, summaryMobile, !!paid);
  const noMethod = !cardEnabled && !pixEnabled;
  const showCard = cardEnabled || noMethod;
  const showPix = pixEnabled || noMethod;
  const view: PayMethodUi = paid ? paid.method : payView === "preview" ? (showPix ? "pix" : "card") : payView;
  const q = quotes[view];
  const card = quotes.card;
  const pix = quotes.pix;
  const selected = effectiveSelectionClient(selection, bump, bumpColor);
  const isKit = selected.pack === "kit";
  const hasBump = selection.pack !== "kit" && bump;
  const total = paid ? paid.amountCents : q.amountCents;
  const shippingCents = paid ? paid.shippingCents : q.shippingCents;
  const couponOff = paid ? 0 : q.couponDiscountCents;
  const pixSaving = card.amountCents - pix.amountCents;
  const [c1] = selected.colors;

  const installments = paid ? paid.installments : card.installments;
  const per = paid ? Math.round(paid.amountCents / Math.max(1, paid.installments)) : card.installmentCents;

  if (!paid) {
    // The breakdown uses only server quotes, separating the Pix and coupon reductions.
    const productsTotal = view === "pix" && showCard ? Math.max(q.productSubtotalCents, card.productSubtotalCents) : q.productSubtotalCents;
    const pixDiscount = view === "pix" ? productsTotal - q.productSubtotalCents : 0;

    return (
      <aside className={`${styles.summary} ck-card order-summary`} aria-label="Resumo do pedido" data-expanded={expanded}>
        <button type="button" className={`${styles.toggle} ck-summary-toggle`} aria-expanded={expanded} aria-controls="checkout-summary-details" aria-label={expanded ? "Resumo do pedido: recolher" : "Ver resumo do pedido"} onClick={() => setExpanded(!expanded)}>
          <span className={styles.heading}><span>RESUMO<small>Informações da sua compra</small></span></span>
          <span className={styles.headingTotal}>{money(total)}<ChevronDown size={17} aria-hidden="true" /></span>
        </button>
        <div className={`${styles.details} ck-summary-details`} id="checkout-summary-details" hidden={!expanded}>
          {showPix && onCouponApply ? <CouponField coupon={coupon} applied={!!coupon && pix.couponDiscountCents > 0} busy={couponBusy} onApply={onCouponApply} /> : null}
          <dl className={styles.breakdown} aria-live="polite">
            <div><dt>Produtos</dt><dd>{money(productsTotal)}</dd></div>
            {pixDiscount > 0 ? <div><dt>Desconto no Pix</dt><dd className={styles.saving}>− {money(pixDiscount)}</dd></div> : null}
            {couponOff > 0 ? <div><dt>Desconto do cupom no Pix</dt><dd className={styles.saving}>− {money(couponOff)}</dd></div> : null}
            <div><dt>Frete FULL</dt><dd className={q.shippingCents === 0 ? styles.saving : undefined}>{q.shippingCents === 0 ? "Grátis" : money(q.shippingCents)}</dd></div>
            <div className={styles.finalTotal}><dt>{view === "card" ? "Total no cartão" : "Total no Pix"}</dt><dd>{money(total)}</dd></div>
          </dl>
          {view === "card" ? (
            <p className={styles.paymentNote}><CreditCard size={15} aria-hidden="true" /><span>{installments > 1 ? <><b>{installments}x de {money(per)}</b> sem juros</> : "Pagamento à vista no cartão"}</span></p>
          ) : showCard ? (
            <p className={styles.paymentNote}><CreditCard size={15} aria-hidden="true" /><span>{card.installments > 1 ? <>ou <b>{card.installments}x de {money(card.installmentCents)}</b> sem juros no cartão</> : <>ou <b>{money(card.amountCents)}</b> à vista no cartão</>}</span></p>
          ) : null}
          {view === "card" && showPix ? <p className={styles.paymentNote}><PixLogo size={16} /><span>ou <b>{money(pix.amountCents)}</b> à vista no Pix{pixSaving > 0 ? ` · ${money(pixSaving)} de desconto` : ""}</span></p> : null}
          <ul className={styles.products} aria-label="Produtos e cores escolhidas">
            {selected.colors.map((color, index) => (
              <li className={styles.product} key={`${index}-${color}`} data-summary-unit={index + 1} data-summary-color={color}>
                <Image src={thumbOf(color)} width={52} height={52} alt={`AquaBlast ${colorName(color)}`} />
                <span className={styles.productInfo}><strong>AquaBlast</strong><small>{isKit ? `${index + 1}ª unidade · ` : "Cor: "}{COLOR_LABELS[color]}</small></span>
                <span className={styles.quantity}>Qtd. 1</span>
              </li>
            ))}
          </ul>
          {hasBump ? (
            <div className={styles.bump} data-summary-bump={bumpColor ? "confirmed" : "pending"}><span><Check size={14} aria-hidden="true" />{bumpColor ? "2ª unidade adicionada" : "2ª unidade: falta escolher a cor"}</span><b>+ {money(q.bumpDeltaCents)}</b></div>
          ) : null}
          {selectionEditor ? (
            <details className={`${styles.colorEditor} ck-summary-color-editor`}>
              <summary>Alterar cores <ChevronDown size={15} aria-hidden="true" /></summary>
              {selectionEditor}
            </details>
          ) : null}
          {deliveryPromise ? <p className="ck-delivery-promise">{deliveryPromise}</p> : null}
        </div>
        <div className={styles.benefit} data-summary-benefit="shipping" role="note" aria-label="Benefício do pedido">
          <span><Truck size={17} aria-hidden="true" /><span>{q.shippingCents === 0 ? <>Seu pedido tem <strong>frete FULL grátis</strong></> : <>Frete FULL por <strong>{money(q.shippingCents)}</strong></>}</span><Check size={15} aria-hidden="true" /></span>
          <i aria-hidden="true" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="ck-card order-summary" aria-label="Resumo do pedido" data-expanded={expanded}>
      <button type="button" className="ck-summary-toggle" aria-expanded={expanded} aria-controls="checkout-summary-details" aria-label={expanded ? "Resumo do pedido: recolher" : "Ver resumo do pedido"} onClick={() => setExpanded(!expanded)}>
        <span className="ck-summary-toggle-label"><ShoppingBag size={19} aria-hidden="true" /><span>{expanded ? "Resumo do pedido" : "Ver resumo do pedido"}<small>{isKit || hasBump ? "2 AquaBlast" : "1 AquaBlast"} · {paid ? "Valor pago" : view === "pix" ? "Total no Pix" : "Total no cartão"}</small></span></span>
        <span className="ck-summary-toggle-total">{money(total)}<ChevronDown size={17} aria-hidden="true" /></span>
      </button>
      <div className="ck-summary-details" id="checkout-summary-details">
      <h2 className="ck-sum-title">Resumo do pedido</h2>
      <div className={`selected-product ck-summary-product${isKit ? " is-kit" : ""}`}>
        {isKit ? (
          <span className="ck-kit-thumbs">
            {selected.colors.map((color, index) => (
              <span className="ck-kit-thumb" key={`${index}-${color}`}>
                <Image src={thumbOf(color)} width={52} height={52} alt={`${index + 1}º AquaBlast ${colorName(color)}`} />
                <span>{index + 1}º {colorName(color)}</span>
              </span>
            ))}
          </span>
        ) : (
          <Image src={thumbOf(c1)} width={80} height={80} alt={`AquaBlast ${colorName(c1)}`} />
        )}
        <div className="ck-product-pricing">
          <h4>{isKit ? "Kit com 2 AquaBlast" : "1 unidade AquaBlast"}</h4>
          {!isKit ? <p>Cor {colorName(c1)}</p> : null}
          <div className={`total is-${view}`} aria-live="polite">
            <div className="ck-total-heading">
              {view === "card" ? <span><CreditCard size={20} aria-hidden="true" />Total no cartão</span> : null}
              {!paid && view === "pix" && showCard && pixSaving > 0 ? <em>Economize {money(pixSaving)}</em> : null}
            </div>
            {view === "card" ? (
              <strong>
                <b>
                  {installments}x de {money(per)}
                </b>
                <small>
                  sem juros no cartão
                </small>
              </strong>
            ) : (
              <strong>
                <span className="ck-pix-price"><b>{money(total)}</b><span className="ck-pix-label"><PixLogo size={25} /><span>À vista<br />no Pix</span></span></span>
                {paid ? <small>Valor pago</small> : null}
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
              </span>
            </p>
          ) : null}
        </div>
      </div>
      {selectionEditor ? (
        <details className="ck-summary-color-editor">
          <summary>Alterar cores do pedido <ChevronDown size={16} aria-hidden="true" /></summary>
          {selectionEditor}
        </details>
      ) : null}
      {!paid && showPix && onCouponApply ? (
        <CouponField coupon={coupon} applied={!!coupon && pix.couponDiscountCents > 0} busy={couponBusy} onApply={onCouponApply} />
      ) : null}
      <dl className="price-details">
        {couponOff > 0 ? (
          <div>
            <dt>Desconto do cupom no Pix</dt>
            <dd className="green">− {money(couponOff)}</dd>
          </div>
        ) : null}
        {shippingCents != null ? <div>
          <dt>Entrega</dt>
          <dd className={shippingCents === 0 ? "green" : undefined}>{shippingCents === 0 ? "Grátis" : money(shippingCents)}</dd>
        </div> : null}
        <div className="ck-final-total">
          <dt>{paid ? "Total pago" : view === "card" ? "Total no cartão" : "Total no Pix"}</dt>
          <dd>{money(total)}</dd>
        </div>
      </dl>
      {!paid && deliveryPromise ? <p className="ck-delivery-promise">{deliveryPromise}</p> : null}
      </div>
    </aside>
  );
}
