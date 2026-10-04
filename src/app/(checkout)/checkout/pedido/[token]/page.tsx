import { notFound, redirect } from "next/navigation";
import { Checkout } from "@/components/checkout/Checkout";
import { OrderConfirmed } from "@/components/checkout/OrderConfirmed";
import { PixWatch } from "@/components/checkout/PixWatch";
import type { CheckoutInitial, StepName } from "@/components/checkout/types";
import { ensureBootstrap } from "@/lib/bootstrap";
import { getCartByToken } from "@/lib/checkout/own/cart";
import { isColor, selectionFromCart } from "@/lib/checkout/own/catalog";
import { loadCheckoutProps } from "@/lib/checkout/own/checkout-props";
import { deliveryPromiseText } from "@/lib/site/delivery-promise";
import { maskCEP, maskPhone, money } from "@/lib/checkout/own/masks";
import { getLastPaidAttempt, getOrderByPublicToken } from "@/lib/checkout/own/order";
import { getTheme } from "@/lib/checkout/own/theme-server";
import { getOrderById, maskedDocument } from "@/lib/orders/service";
import { pixQrForScreen } from "@/lib/pix/qr";
import { getSupportWhatsapp } from "@/lib/site/support-contact";
import { CONTACT_EMAIL, zedyUrlFromSelection } from "@/lib/site/constants";
import type { CheckoutCart, Order } from "@/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seu pedido | AquaBlast" };

/** Fora do componente: o relógio é lido uma vez por requisição (Server Component), não durante um render puro. */
function isPixExpired(pixExpiresAt: Date | null): boolean {
  return pixExpiresAt ? pixExpiresAt.getTime() <= Date.now() : true;
}

function currentYear(): number {
  return new Date().getFullYear();
}

function paymentLabel(method: string | null, installments: number | null): string {
  if (method === "pix") return "Pix";
  if (method === "card") return installments && installments > 1 ? `Cartão de crédito em ${installments}x` : "Cartão de crédito";
  return "—";
}

function addressLine(order: Order): string {
  const cityState = [order.addressCity, order.addressState].filter(Boolean).join("/");
  return [order.addressLine1, order.addressNeighborhood, cityState].filter(Boolean).join(" · ") || "—";
}

function itemLabel(item: Order["items"][number]): string {
  const name = item.variant ? `${item.name} (${item.variant})` : item.name;
  return item.quantity > 1 ? `${item.quantity}x ${name}` : name;
}

/**
 * Etapa em que o carrinho retomado abre. `concluido` não deveria chegar aqui (carrinho pago vira
 * redirect para o pedido), mas se chegar volta para o pagamento. Sem dados suficientes gravados,
 * recua para a etapa que falta — nunca abre "pagamento" com endereço vazio.
 */
function resumeStep(cart: CheckoutCart): StepName {
  const hasCustomer = !!(cart.customerName && cart.customerEmail && cart.customerPhone);
  const hasAddress = !!(cart.addressLine1 && cart.addressNumber && cart.addressCity && cart.addressState && cart.addressPostalCode);
  if (!hasCustomer) return "dados";
  if (!hasAddress) return cart.step === "dados" ? "dados" : "entrega";
  if (cart.step === "dados") return "dados";
  if (cart.step === "entrega") return "entrega";
  return "pagamento";
}

function initialFromCart(cart: CheckoutCart, bumpEnabled: boolean): CheckoutInitial {
  return {
    cartToken: cart.token,
    step: resumeStep(cart),
    customer: { name: cart.customerName ?? "", email: cart.customerEmail ?? "", phone: maskPhone(cart.customerPhone ?? ""), cpf: "" },
    // Só a forma mascarada sai do servidor (plano 8.8: "CPF mascarado, nunca o valor inteiro").
    cpfMasked: maskedDocument(cart.customerDocumentEnc),
    address: {
      cep: maskCEP(cart.addressPostalCode ?? ""),
      street: cart.addressLine1 ?? "",
      number: cart.addressNumber ?? "",
      extra: cart.addressLine2 ?? "",
      district: cart.addressNeighborhood ?? "",
      city: cart.addressCity ?? "",
      state: cart.addressState ?? "",
      recipient: cart.recipient ?? cart.customerName ?? "",
    },
    bump: bumpEnabled && cart.bumpAccepted,
    // Cor da 2ª unidade escolhida antes (colors[1]); sem ela o bump reabre marcado e pede a cor de novo.
    bumpColor: bumpEnabled && cart.bumpAccepted && cart.pack === "unit" && isColor(cart.colors[1]) ? cart.colors[1] : null,
  };
}

/**
 * /checkout/pedido/[token] — página durável do pedido (plano 8.8). O token é resolvido em duas tabelas:
 * 1. `orders.publicToken` (é para cá que `Checkout.tsx` navega depois de `onPaid`/`onPending`) —
 *    lido direto do banco (`getOrderByPublicToken`), nunca pela API pública `GET /api/checkout/status`;
 * 2. `checkout_carts.token` (link dos e-mails de carrinho abandonado, `src/lib/email/abandoned.ts`) —
 *    carrinho já pago redireciona para o pedido; carrinho aberto reabre o `<Checkout />` na etapa em que
 *    parou, com os dados preenchidos e o CPF só mascarado.
 * Token que não existe em nenhuma das duas → `notFound()`.
 *
 * Pedido pago mostra `<OrderConfirmed />` (compra confirmada), não mais o checkout com as etapas concluídas.
 *
 * Na tela do pedido não existe `cartToken`, então um Pix expirado não tem botão "Gerar novo código" —
 * o cliente é direcionado ao WhatsApp de suporte (`getSupportWhatsapp`, só aparece quando o dono
 * cadastrou o número; nunca um número inventado).
 */
export default async function PedidoPage({ params }: { params: Promise<{ token: string }> }) {
  await ensureBootstrap();
  const { token } = await params;
  const order = await getOrderByPublicToken(token);

  if (!order) {
    const cart = await getCartByToken(token);
    if (!cart) notFound();

    const linked = cart.orderId ? await getOrderById(cart.orderId) : null;
    if (linked?.publicToken && (linked.paymentStatus === "paid" || cart.status === "converted" || cart.status === "recovered")) {
      redirect(`/checkout/pedido/${linked.publicToken}`);
    }
    if (cart.status === "converted" || cart.status === "recovered") notFound();

    const selection = selectionFromCart(cart);
    const { mode, props } = await loadCheckoutProps(selection.pack, cart.bumpAccepted);
    if (mode === "zedy") redirect(zedyUrlFromSelection(selection));

    return (
      <Checkout
        {...props}
        selection={selection}
        initial={initialFromCart(cart, props.bumpEnabled)}
        deliveryPromise={deliveryPromiseText()}
      />
    );
  }

  if (order.paymentStatus === "paid") {
    // Pedido pago: tela de compra confirmada (layout do dono, 2026-09-28). As etapas seguem o status real do pedido.
    const [theme, attempt, whatsapp] = await Promise.all([getTheme(), getLastPaidAttempt(order.id), getSupportWhatsapp()]);
    const amountCents = attempt?.amountCents ?? Math.round(Number(order.amountTotal ?? "0") * 100);
    return (
      <OrderConfirmed
        theme={theme}
        orderNumber={order.orderNumber}
        status={order.status}
        testMode={attempt?.provider === "simulado"}
        firstName={order.customerName?.trim().split(/\s+/)[0] || null}
        summary={{
          items: order.items.length > 0 ? order.items.map(itemLabel) : ["Pedido AquaBlast"],
          payment: paymentLabel(attempt?.method ?? order.paymentMethod, attempt?.installments ?? order.installments),
          total: money(amountCents),
          address: addressLine(order),
          email: order.customerEmail,
        }}
        support={whatsapp ? { href: whatsapp.href, external: true } : { href: `mailto:${CONTACT_EMAIL}`, external: false }}
        year={currentYear()}
      />
    );
  }

  const whatsapp = await getSupportWhatsapp();

  const pixExpired = isPixExpired(order.pixExpiresAt);
  const showPixWatch = order.paymentStatus === "pending" && order.paymentMethod === "pix" && order.pixCode && !pixExpired;

  let title = "Pagamento em análise";
  let body = "Estamos confirmando o pagamento do seu pedido. Você recebe a confirmação por e-mail assim que aprovar.";
  if (order.paymentStatus === "refused") {
    title = "Pagamento não aprovado";
    body = "O pagamento deste pedido foi recusado. Tente novamente pelo link de compra ou fale com a gente.";
  } else if (order.paymentStatus === "cancelled") {
    title = "Pedido cancelado";
    body = "Este pedido foi cancelado.";
  } else if (order.paymentStatus === "expired") {
    title = "Pagamento expirado";
    body = "O prazo para pagar este pedido expirou.";
  } else if (order.paymentStatus === "refunded") {
    title = "Pedido reembolsado";
    body = "O valor deste pedido foi reembolsado.";
  } else if (order.paymentStatus === "chargeback") {
    title = "Pedido contestado";
    body = "Este pedido está em contestação com a operadora do cartão.";
  } else if (order.paymentStatus === "pending" && order.paymentMethod === "pix" && pixExpired) {
    title = "Código Pix expirado";
    body = "O código Pix deste pedido expirou.";
  }

  return (
    <div className="ck-root">
      <main className="container ck-main">
        <div style={{ maxWidth: 560, margin: "32px auto" }} className="ck-card ck-flow">
          <h1>{title}</h1>
          <p>
            Pedido nº <strong>{order.orderNumber}</strong>
          </p>
          <p>{body}</p>
          {showPixWatch && order.pixCode ? (
            <PixWatch code={order.pixCode} qrUrl={pixQrForScreen(order.pixCode, order.pixQrUrl)} expiresAt={order.pixExpiresAt!.toISOString()} publicToken={token} />
          ) : null}
          {whatsapp ? (
            <p>
              <a href={whatsapp.href} target="_blank" rel="noopener noreferrer">
                Fale com a gente no WhatsApp: {whatsapp.label}
              </a>
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
