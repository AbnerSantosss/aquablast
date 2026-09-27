import { PixWatch } from "@/components/checkout/PixWatch";
import { SuccessView } from "@/components/checkout/SuccessView";
import { ensureBootstrap } from "@/lib/bootstrap";
import { getOrderByPublicToken } from "@/lib/checkout/own/order";
import { getSupportWhatsapp } from "@/lib/site/support-contact";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seu pedido | AquaBlast" };

function paymentLabel(order: { paymentMethod: string | null; installments: number | null }): string {
  if (order.paymentMethod === "pix") return "Pix";
  if (order.paymentMethod === "card") return order.installments && order.installments > 1 ? `Cartão de crédito em ${order.installments}x` : "Cartão de crédito";
  return "—";
}

function addressLine(order: { addressLine1: string | null; addressNeighborhood: string | null; addressCity: string | null; addressState: string | null }): string {
  const cityState = [order.addressCity, order.addressState].filter(Boolean).join("/");
  return [order.addressLine1, order.addressNeighborhood, cityState].filter(Boolean).join(" · ") || "—";
}

/**
 * /checkout/pedido/[token] — página durável do pedido (plano 8.8), lida direto do banco
 * (`getOrderByPublicToken`, nunca a API pública `GET /api/checkout/status`, que só devolve
 * status/orderNumber). É para aqui que `Checkout.tsx` navega depois de `onPaid`/`onPending`.
 *
 * Não é a mesma tela do carrinho ativo: aqui não existe `cartToken`, então um Pix expirado não tem botão
 * "Gerar novo código" (isso pede um carrinho vivo) — o cliente é direcionado ao WhatsApp de suporte
 * (`getSupportWhatsapp`, só aparece quando o dono cadastrou o número; nunca um número inventado).
 */
export default async function PedidoPage({ params }: { params: Promise<{ token: string }> }) {
  await ensureBootstrap();
  const { token } = await params;
  const [order, whatsapp] = await Promise.all([getOrderByPublicToken(token), getSupportWhatsapp()]);

  if (!order) {
    return (
      <div className="ck-root">
        <main className="container ck-main">
          <section className="ck-card" style={{ maxWidth: 480, margin: "48px auto", padding: "32px 28px", textAlign: "center" }}>
            <h1>Pedido não encontrado</h1>
            <p>Não encontramos esse pedido. Se você já pagou e o link não abre, fale com a gente.</p>
            {whatsapp ? (
              <p>
                <a href={whatsapp.href} target="_blank" rel="noopener noreferrer">
                  WhatsApp: {whatsapp.label}
                </a>
              </p>
            ) : null}
          </section>
        </main>
      </div>
    );
  }

  const item = order.items[0];
  const amountCents = Math.round(Number(order.amountTotal ?? "0") * 100);

  if (order.paymentStatus === "paid") {
    return (
      <div className="ck-root">
        <main className="container ck-main">
          <div style={{ maxWidth: 560, margin: "32px auto" }}>
            <SuccessView
              orderNumber={order.orderNumber}
              itemTitle={item?.name ?? "Pedido AquaBlast"}
              itemVariant={item?.variant ?? ""}
              addressLine={addressLine(order)}
              email={order.customerEmail ?? ""}
              paymentLabel={paymentLabel(order)}
              amountCents={amountCents}
              testMode={false}
            />
          </div>
        </main>
      </div>
    );
  }

  const pixExpired = order.pixExpiresAt ? order.pixExpiresAt.getTime() <= Date.now() : true;
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
