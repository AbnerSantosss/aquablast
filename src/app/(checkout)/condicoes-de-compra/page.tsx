import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/checkout/PolicyPage";

export const metadata: Metadata = { title: "Condições de compra | AquaBlast", description: "Informações sobre produtos, pagamento, entrega e atendimento AquaBlast." };

export default function PurchaseConditionsPage() {
  return <PolicyPage title="Condições de compra" intro="Confira as informações para escolher seu AquaBlast e acompanhar cada etapa do pedido.">
    <section><h2>Produto e seleção</h2><p>Antes de concluir a compra, confira a quantidade, as cores e os itens descritos no resumo do pedido. A seleção pode ser de uma unidade ou de um kit com duas unidades. Imagens de campanha ilustram o produto; os itens incluídos são os informados na oferta e no resumo.</p></section>
    <section><h2>Preços e pagamento</h2><p>O checkout informa o valor total para cada forma de pagamento disponível. O preço no Pix pode ser diferente do preço no cartão. Quando houver parcelamento, confira o número de parcelas, o valor de cada parcela e o total antes de pagar.</p><p>Cupons dependem de validação e das condições da oferta. O desconto aplicável aparece no resumo após a validação. A conclusão do pedido depende da confirmação do pagamento; transações em análise ainda aguardam retorno do serviço de pagamento.</p></section>
    <section><h2>Entrega e acompanhamento</h2><p>Confira o CEP, o endereço completo e o nome do destinatário antes de finalizar. As condições de frete e o prazo estimado são apresentados na etapa de entrega. Depois do envio, acompanhe as atualizações disponíveis em <Link href="/rastrear">Rastrear pedido</Link>.</p></section>
    <section><h2>Trocas, devoluções e reembolso</h2><p>As orientações para desistência, produto avariado, troca e reembolso estão na <Link href="/trocas-e-devolucoes">Política de trocas e devoluções</Link>. Entre em contato com a loja informando o número do pedido para receber as instruções adequadas ao seu caso.</p></section>
    <section><h2>Privacidade e atendimento</h2><p>Consulte a <Link href="/politica-de-privacidade">Política de privacidade</Link> para entender o uso de informações no checkout. Para dúvidas sobre a compra, utilize o contato abaixo.</p></section>
  </PolicyPage>;
}
