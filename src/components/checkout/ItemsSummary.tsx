import { Check, ChevronDown, CreditCard, Minus, Plus, ShoppingBag, Trash2, Truck } from "lucide-react";
import Image from "next/image";
import { useState, useSyncExternalStore } from "react";
import type { Quote } from "@/lib/checkout/own/pricing";
import { money } from "@/lib/checkout/own/masks";
import { FULL_SHIPPING_LABEL } from "@/lib/checkout/own/shipping";
import { PixLogo } from "./PixLogo";
import { summaryIsExpanded, type PayView } from "./OrderSummary";
import { ITEMS_MAX_LINES, ITEMS_MAX_QUANTITY, type ItemsCatalogProduct, type ItemsLine } from "./items-types";
import type { PayMethodUi } from "./types";
import styles from "./OrderSummary.module.css";
import own from "./ItemsSummary.module.css";

const SUMMARY_MOBILE_QUERY = "(max-width: 1099px)";
function subscribeViewport(onChange: () => void) {
  const media = window.matchMedia(SUMMARY_MOBILE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const mobileSnapshot = () => window.matchMedia(SUMMARY_MOBILE_QUERY).matches;
const serverSnapshot = () => true;

function Thumb({ product, size = 52 }: { product: ItemsCatalogProduct | undefined; size?: number }) {
  if (!product?.imageUrl) return <span className={own.icon} aria-hidden="true"><ShoppingBag size={20} /></span>;
  // Foto externa (image_url de outra empresa, https): sem otimização do Next, que só conhece os hosts do projeto.
  return <Image src={product.imageUrl} width={size} height={size} alt={product.name} unoptimized={/^https?:\/\//i.test(product.imageUrl)} />;
}

/**
 * Resumo do checkout por itens (`/c/[slug]`, multiempresa 2026-10-13). Mesmo visual do OrderSummary (classes de
 * OrderSummary.module.css). Lista os produtos com quantidade; nas etapas 1 e 2 (`onItemsChange`) o cliente soma,
 * tira e adiciona produtos ativos da empresa. Os valores vêm de `quotes` (servidor, ou a prévia local com os preços do
 * catálogo enquanto a gravação não volta); o servidor recalcula tudo ao pagar.
 */
export function ItemsSummary({
  products,
  items,
  onItemsChange,
  quotes,
  shippingChosen = false,
  payView,
  cardEnabled,
  pixEnabled,
  deliveryPromise = null,
}: {
  products: ItemsCatalogProduct[];
  items: ItemsLine[];
  /** null: só leitura (etapa de pagamento). */
  onItemsChange: ((items: ItemsLine[]) => void) | null;
  quotes: { pix: Quote; card: Quote };
  shippingChosen?: boolean;
  payView: PayView;
  cardEnabled: boolean;
  pixEnabled: boolean;
  deliveryPromise?: string | null;
}) {
  const [expandedChoice, setExpanded] = useState<boolean | null>(null);
  const mobile = useSyncExternalStore(subscribeViewport, mobileSnapshot, serverSnapshot);
  const expanded = summaryIsExpanded(expandedChoice, mobile, false);
  const noMethod = !cardEnabled && !pixEnabled;
  const showCard = cardEnabled || noMethod;
  const showPix = pixEnabled || noMethod;
  const view: PayMethodUi = payView === "preview" ? (showPix ? "pix" : "card") : payView;
  const q = quotes[view];
  const card = quotes.card;
  const pix = quotes.pix;
  const total = q.amountCents;
  const pixSaving = card.amountCents - pix.amountCents;
  const productsTotal = view === "pix" && showCard ? Math.max(q.productSubtotalCents, card.productSubtotalCents) : q.productSubtotalCents;
  const pixDiscount = view === "pix" ? productsTotal - q.productSubtotalCents : 0;
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const units = items.reduce((s, i) => s + i.quantity, 0);
  const first = bySlug.get(items[0]?.productSlug ?? "");
  const compact = !expanded && mobile;
  const inCart = new Set(items.map((i) => i.productSlug));
  const addable = onItemsChange && items.length < ITEMS_MAX_LINES ? products.filter((p) => !inCart.has(p.slug)) : [];

  const setQty = (slug: string, quantity: number) => {
    if (!onItemsChange) return;
    if (quantity < 1) onItemsChange(items.filter((i) => i.productSlug !== slug));
    else onItemsChange(items.map((i) => (i.productSlug === slug ? { ...i, quantity: Math.min(quantity, ITEMS_MAX_QUANTITY) } : i)));
  };
  const add = (slug: string) => {
    if (!onItemsChange || inCart.has(slug)) return;
    onItemsChange([...items, { productSlug: slug, quantity: 1 }]);
  };

  return (
    <aside className={`${styles.summary} ck-card order-summary`} aria-label="Resumo do pedido" data-expanded={expanded} data-compact={compact} data-items-mode="true">
      <button type="button" className={`${styles.toggle} ck-summary-toggle`} aria-expanded={expanded} aria-controls="checkout-summary-details" aria-label={compact ? undefined : expanded ? "Resumo do pedido: recolher" : "Ver resumo do pedido"} onClick={() => setExpanded(!expanded)}>
        {compact ? (
          <>
            {first?.imageUrl ? <Image className={styles.barThumb} src={first.imageUrl} width={52} height={52} alt="" unoptimized={/^https?:\/\//i.test(first.imageUrl)} /> : <span className={own.icon} aria-hidden="true"><ShoppingBag size={20} /></span>}
            <span className={styles.barText}>
              <span className={styles.barRow}>
                <span className={styles.barProduct}><strong>{items.length === 1 && first ? first.name : `${items.length} produtos`}</strong>{" "}<span>Qtd. {units}</span></span>{" "}
                <span className={styles.headingTotal}>{money(total)}</span>
              </span>{" "}
              <span className={styles.barRow}>
                <span className={styles.barAction}>Ver resumo e valores<ChevronDown size={16} aria-hidden="true" /></span>
              </span>
            </span>
          </>
        ) : (
          <>
            <span className={styles.heading}><span>RESUMO<small>Informações da sua compra</small></span></span>
            <span className={styles.headingTotal}>{money(total)}<ChevronDown size={17} aria-hidden="true" /></span>
          </>
        )}
      </button>
      <div className={`${styles.details} ck-summary-details`} id="checkout-summary-details" hidden={!expanded}>
        <dl className={styles.breakdown} aria-live="polite">
          <div><dt>Produtos</dt><dd>{money(productsTotal)}</dd></div>
          {pixDiscount > 0 ? <div><dt>Desconto no Pix</dt><dd className={styles.saving}>− {money(pixDiscount)}</dd></div> : null}
          {shippingChosen || q.shippingCents > 0 ? <div><dt>{q.shippingCents === 0 ? "Frete" : FULL_SHIPPING_LABEL}</dt><dd className={q.shippingCents === 0 ? styles.saving : undefined}>{q.shippingCents === 0 ? "Grátis" : money(q.shippingCents)}</dd></div> : null}
          <div className={styles.finalTotal}><dt>{view === "card" ? "Total no cartão" : "Total no Pix"}</dt><dd>{money(total)}</dd></div>
        </dl>
        {view === "card" ? (
          <p className={styles.paymentNote}><CreditCard size={15} aria-hidden="true" /><span>{card.installments > 1 ? <><b>{card.installments}x de {money(card.installmentCents)}</b> sem juros</> : "Pagamento à vista no cartão"}</span></p>
        ) : showCard ? (
          <p className={styles.paymentNote}><CreditCard size={15} aria-hidden="true" /><span>{card.installments > 1 ? <>ou <b>{card.installments}x de {money(card.installmentCents)}</b> sem juros no cartão</> : <>ou <b>{money(card.amountCents)}</b> à vista no cartão</>}</span></p>
        ) : null}
        {view === "card" && showPix ? <p className={styles.paymentNote}><PixLogo size={16} /><span>ou <b>{money(pix.amountCents)}</b> à vista no Pix{pixSaving > 0 ? ` · ${money(pixSaving)} de desconto` : ""}</span></p> : null}
        <ul className={styles.products} aria-label="Produtos do pedido">
          {items.map((line) => {
            const p = bySlug.get(line.productSlug);
            const unit = p ? (view === "card" ? p.priceCardCents : p.pricePixCents) : 0;
            const name = p?.name ?? line.productSlug;
            return (
              <li className={styles.product} key={line.productSlug} data-items-line={line.productSlug} data-items-qty={line.quantity}>
                <Thumb product={p} />
                <span className={styles.productInfo}><strong>{name}</strong><small>{money(unit)} {view === "card" ? "no cartão" : "no Pix"} cada</small></span>
                {onItemsChange ? (
                  <span className={own.qty} role="group" aria-label={`Quantidade de ${name}`}>
                    <button type="button" onClick={() => setQty(line.productSlug, line.quantity - 1)} aria-label={line.quantity > 1 ? `Diminuir ${name}` : `Remover ${name}`} disabled={line.quantity <= 1 && items.length <= 1}>
                      {line.quantity > 1 ? <Minus size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
                    </button>
                    <output aria-live="polite">{line.quantity}</output>
                    <button type="button" onClick={() => setQty(line.productSlug, line.quantity + 1)} aria-label={`Aumentar ${name}`} disabled={line.quantity >= ITEMS_MAX_QUANTITY}>
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </span>
                ) : (
                  <span className={styles.quantity}>Qtd. {line.quantity}</span>
                )}
              </li>
            );
          })}
        </ul>
        {addable.length ? (
          <div className={own.add}>
            <p>Adicionar ao pedido</p>
            <ul>
              {addable.map((p) => (
                <li key={p.slug} data-items-add={p.slug}>
                  <Thumb product={p} size={40} />
                  <span><strong>{p.name}</strong><small>{money(p.pricePixCents)} no Pix</small></span>
                  <button type="button" onClick={() => add(p.slug)} aria-label={`Adicionar ${p.name}`}><Plus size={14} aria-hidden="true" />Adicionar</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {deliveryPromise ? <p className="ck-delivery-promise">{deliveryPromise}</p> : null}
      </div>
      <div className={styles.benefit} data-summary-benefit="shipping" role="note" aria-label="Benefício do pedido">
        <span><Truck size={17} aria-hidden="true" /><span>{q.shippingCents === 0 ? <>Seu pedido tem <strong>frete grátis</strong></> : <>Entrega por <strong>{FULL_SHIPPING_LABEL}</strong></>}</span><Check size={15} aria-hidden="true" /></span>
        <i aria-hidden="true" />
      </div>
    </aside>
  );
}
