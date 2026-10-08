import { notFound } from "next/navigation";
import { PixPaymentCode } from "@/components/checkout/PixPaymentCode";
import { qrSvgDataUri } from "@/lib/pix/qr";

export const metadata = { title: "Prévia local do Pix", robots: { index: false, follow: false } };

/** Local visual fixture: no order, gateway call or payable Pix is created. */
export default function PixPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const code = "SIMULADO-NAO-PAGUE-PREVIA-LOCAL-AQUABLAST";
  return <div className="ck ck-root ck-conversion ck-reference">
    <main className="container ck-main">
      <h1>AquaBlast</h1>
      <p>Prévia local de layout — nenhum pagamento pode ser realizado aqui.</p>
      <div className="ck-grid">
        <section className="ck-step is-done" data-step="1"><div className="ck-step-head"><span className="ck-dot">✓</span><h3>Seus dados</h3></div><p>Etapa concluída na demonstração.</p></section>
        <section className="ck-step is-current" data-step="3">
          <div className="ck-step-head"><span className="ck-dot">3</span><h3>Pagamento</h3></div><p>Escolha a forma de pagamento para finalizar seu pedido.</p>
          <div className="pay-item pay-item-pix"><div className="pay-head"><strong>Pix com desconto</strong></div><div className="pay-body">
            <PixPaymentCode code={code} qrUrl={qrSvgDataUri(code)} seconds={536} amountCents={14990} storeName="AquaBlast · demonstração sem cobrança" />
          </div></div>
        </section>
        <aside className="order-summary"><h2>Resumo</h2><p>AquaBlast · prévia visual</p><p>Valor ilustrativo: R$ 149,90</p><p>Esta página testa apenas a apresentação do Pix.</p><details><summary>Testar a cópia nesta prévia</summary><label htmlFor="paste-test">Cole aqui o código de demonstração</label><textarea id="paste-test" style={{ width: "100%", minHeight: 64 }} /></details></aside>
      </div>
    </main>
  </div>;
}
