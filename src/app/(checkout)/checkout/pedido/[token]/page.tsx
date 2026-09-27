import { notFound, redirect } from "next/navigation";
import { Checkout } from "@/components/checkout/Checkout";
import { PixWatch } from "@/components/checkout/PixWatch";
import { SuccessView } from "@/components/checkout/SuccessView";
import type { CheckoutInitial, PaidInfo, StepName } from "@/components/checkout/types";
import { ensureBootstrap } from "@/lib/bootstrap";
import { getCartByToken } from "@/lib/checkout/own/cart";
import { selectionFromCart } from "@/lib/checkout/own/catalog";
import { loadCheckoutProps } from "@/lib/checkout/own/checkout-props";
import { maskCEP, maskPhone, money } from "@/lib/checkout/own/masks";
import { getCartByOrderId, getLastPaidAttempt, getOrderByPublicToken } from "@/lib/checkout/own/order";
import { getOrderById, maskedDocument } from "@/lib/orders/service";
import { getSupportWhatsapp } from "@/lib/site/support-contact";
import { zedyUrlFromSelection } from "@/lib/site/constants";
import type { CheckoutCart } from "@/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seu pedido | AquaBlast" };

function paymentLabel(order: { paymentMethod: string | null; installments: number | null }): string {
  if (order.paymentMethod === "pix") return "Pix";
  if (order.paymentMethod === "card") return order.installments && order.installments > 1 ? `Cartão de crédito em ${order.installments}x` : "Cartão de crédito";
  return "—";
}

/** Fora do componente: o relógio é lido uma vez por requisição (Server Component), não durante um render puro. */
function isPixExpired(pixExpiresAt: Date | null): boolean {
  return pixExpiresAt ? pixExpiresAt.getTime() <= Date.now() : true;
}

function addressLine(order: { addressLine1: string | null; addressNeighborhood: string | null; addressCity: string | null; addressState: string | null }): string {
  const cityState = [order.addressCity, order.addressState].filter(Boolean).join("/");
  return [order.addressLine1, order.addressNeighborhood, cityState].filter(Boolean).join(" · ") || "—";
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

    return <Checkout {...props} selection={selection} initial={initialFromCart(cart, props.bumpEnabled)} />;
  }

  const whatsapp = await getSupportWhatsapp();
  const item = order.items[0];
  const amountCents = Math.round(Number(order.amountTotal ?? "0") * 100);

  if (order.paymentStatus === "paid") {
    // Pedido pago: o MESMO layout do checkout (origem: SuccessView dentro do .ck-flow, etapas concluídas sem
    // EDITAR). Seleção, bump, número e destinatário só existem no carrinho; bandeira/4 últimos, na tentativa paga.
    const [cart, attempt] = await Promise.all([getCartByOrderId(order.id), getLastPaidAttempt(order.id)]);
    const paid: PaidInfo = {
      orderNumber: order.orderNumber,
      method: (attempt?.method ?? order.paymentMethod) === "card" ? "card" : "pix",
      amountCents: attempt?.amountCents ?? amountCents,
      installments: attempt?.installments ?? order.installments ?? 1,
      cardBrand: attempt?.cardBrand ?? null,
      cardLast4: attempt?.cardLast4 ?? null,
      testMode: attempt?.provider === "simulado",
    };
    if (cart) {
      const selection = selectionFromCart(cart);
      const { props } = await loadCheckoutProps(selection.pack, cart.bumpAccepted);
      const initial: CheckoutInitial = { ...initialFromCart(cart, true), step: "pagamento", bump: cart.bumpAccepted };
      return <Checkout {...props} selection={selection} initial={initial} paid={paid} />;
    }
    // Pedido sem carrinho (não deveria acontecer no checkout próprio): confirmação simples com os dados do pedido.
    return (
      <div className="ck ck-root">
        <main className="container ck-main">
          <section className="ck-card ck-flow" aria-label="Seu pedido">
            <SuccessView
              orderNumber={order.orderNumber}
              payment={paymentLabel(order)}
              items={[item?.variant ? `${item.name} (${item.variant})` : (item?.name ?? "Pedido AquaBlast")]}
              total={money(paid.amountCents)}
              address={addressLine(order)}
              email={order.customerEmail ?? ""}
              testMode={paid.testMode}
              restartHref="/"
            />
          </section>
        </main>
      </div>
    );
  }

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
            <PixWatch code={order.pixCode} qrUrl={order.pixQrUrl} expiresAt={order.pixExpiresAt!.toISOString()} publicToken={token} />
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
