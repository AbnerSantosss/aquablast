import { unsubscribeCart } from "@/lib/checkout/own/cart";

export const metadata = { title: "Descadastro | AquaBlast" };

/**
 * Link de descadastro dos e-mails de carrinho abandonado (plano 10.2). Usa as classes do checkout
 * próprio (`.ck-root`, `.ck-card`) para ficar visualmente coerente com o resto do fluxo; a folha de
 * estilo (`@/styles/checkout/checkout.css`) é adicionada pelo agente que constrói a tela do checkout —
 * até lá, esta página funciona sem estilo próprio, só com os elementos semânticos.
 */
export default async function DescadastrarCarrinhoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await unsubscribeCart(token);

  return (
    <div className="ck-root">
      <main className="container ck-main">
        <section className="ck-card" style={{ maxWidth: 480, margin: "48px auto", padding: "32px 28px", textAlign: "center" }}>
          {found ? (
            <>
              <h1>Pronto.</h1>
              <p>Você não vai mais receber lembretes desta compra.</p>
            </>
          ) : (
            <>
              <h1>Link inválido</h1>
              <p>Não encontramos esse carrinho. Se você continua recebendo e-mails, fale com a gente pelo WhatsApp.</p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
