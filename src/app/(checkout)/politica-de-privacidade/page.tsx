import type { Metadata } from "next";
import { PolicyPage } from "@/components/checkout/PolicyPage";
import { CONTACT_EMAIL } from "@/lib/site/constants";

export const metadata: Metadata = { title: "Política de privacidade | AquaBlast", description: "Como os dados são utilizados na compra e como entrar em contato sobre privacidade." };

export default function PrivacyPage() {
  return <PolicyPage title="Política de privacidade" intro="Entenda como seus dados são usados no checkout AquaBlast e como falar com a loja sobre privacidade.">
    <section><h2>Dados utilizados na compra</h2><p>O checkout solicita nome, e-mail, celular, CPF e endereço de entrega. Essas informações são utilizadas para processar a compra, identificar o pagamento, entregar o pedido e prestar atendimento. O sistema também registra informações técnicas, como endereço IP, navegador e identificador do carrinho, para manter o funcionamento e a segurança da compra.</p></section>
    <section><h2>Pagamento, entrega e comunicação</h2><p>As informações necessárias à compra são encaminhadas aos serviços de pagamento, entrega e comunicação utilizados pela loja. O processamento depende da forma de pagamento escolhida. O e-mail informado pode receber a confirmação, atualizações do pedido e lembretes para concluir uma compra iniciada. Quando disponível na mensagem, o link de descadastro permite interromper os lembretes.</p></section>
    <section><h2>Cookies e preferências no checkout</h2><p>O navegador armazena a identificação do carrinho e sua escolha sobre cookies. Identificadores de publicidade podem ser utilizados para medir campanhas conforme as preferências apresentadas no checkout. Você pode escolher “Só o essencial” para continuar a compra sem aceitar esses identificadores.</p></section>
    <section><h2>Seus direitos e contato</h2><p>Você pode solicitar informações sobre o tratamento, acesso e correção dos seus dados, além de revogar o consentimento ou solicitar eliminação quando aplicável. Determinados registros podem precisar ser conservados para cumprir obrigações legais ou exercer direitos.</p><p>Envie sua solicitação para <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Para proteger suas informações, poderá ser necessário confirmar sua identidade antes do atendimento.</p><p>Saiba mais sobre seus direitos nas <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares" target="_blank" rel="noopener noreferrer">orientações da Autoridade Nacional de Proteção de Dados (ANPD)</a>.</p></section>
  </PolicyPage>;
}
