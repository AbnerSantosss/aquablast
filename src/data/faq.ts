import { money } from "@/lib/checkout/own/masks";
import { FULL_SHIPPING_CENTS, FULL_SHIPPING_LABEL } from "@/lib/checkout/own/shipping";
import type { SitePrices } from "@/lib/site/prices";
import type { FaqItem } from "@/lib/site/types";

/** Resposta de pagamento com os valores do painel; as frases de parcela e de desconto só entram quando existem. */
function paymentAnswer(p: SitePrices): string {
  const n = p.installments;
  const card =
    n > 1
      ? `Pix ou cartão de crédito em até ${n}x sem juros. No cartão, a unidade sai por ${n}x de ${p.unit.installment} (total ${p.unit.card}).`
      : `Pix ou cartão de crédito. No cartão, a unidade sai por ${p.unit.card}.`;
  const discount = p.unit.pixDiscount ? `, com ${p.unit.pixDiscount} de desconto` : "";
  return `${card} No Pix à vista você paga ${p.unit.pix} pela unidade${discount}. O ${FULL_SHIPPING_LABEL} de ${money(FULL_SHIPPING_CENTS)} é somado ao valor da unidade no checkout. O kit com duas custa ${p.kit.pix} no Pix ou ${p.kit.card} no cartão e tem frete grátis.`;
}

// Fonte única do FAQ visível, do JSON-LD e do /llms.txt. Os preços vêm de quem chama (getSitePrices).
// Campanha de verão: somente atributos confirmados; não estimar prazo, alcance ou bateria.
export const buildFaq = (prices: SitePrices): FaqItem[] => [
  {
    question: "O que é o AquaBlast?",
    answer:
      "É um brinquedo de água elétrico, do tipo lançador de água, com efeito luminoso de luz LED, bateria recarregável por USB e reservatório em tambor. Você pode escolher uma unidade ou o kit com duas, nas cores azul, vermelho e preto.",
  },
  {
    question: "Precisa de pilha?",
    answer: "O AquaBlast usa bateria recarregável por USB. Siga as instruções de carga e conservação que acompanham o produto.",
  },
  {
    question: "Como recarrega?",
    answer: "A recarga é feita por cabo USB. Consulte as orientações que acompanham o produto para usar a alimentação adequada e fazer a recarga.",
  },
  {
    question: "Funciona na piscina?",
    answer: "A brincadeira pode acontecer ao ar livre, ao redor da piscina, com supervisão de um adulto. Mantenha a parte elétrica fora da água, não mergulhe o brinquedo e siga as instruções do produto.",
  },
  {
    question: "Como escolher meu AquaBlast?",
    answer:
      "Escolha uma unidade ou o kit com duas e confirme a cor de cada AquaBlast: azul, vermelho ou preto. Depois de confirmar as cores, continue para o checkout para informar os dados de entrega e escolher a forma de pagamento.",
  },
  {
    question: "Quais cores estão disponíveis?",
    answer:
      "O AquaBlast está disponível nas cores azul, vermelho e preto. Toque nas opções de cor para visualizar o produto e escolher a sua.",
  },
  {
    question: "Quais são as formas de pagamento?",
    answer: paymentAnswer(prices),
  },
  {
    question: "Para qual idade o brinquedo é indicado?",
    answer:
      "Confira a indicação de idade na embalagem antes de presentear. A brincadeira deve ter supervisão de um adulto e seguir as orientações do fabricante.",
  },
  {
    question: "Como abastecer e cuidar do AquaBlast?",
    answer:
      "A água vai no tambor. Siga as instruções de abastecimento e conservação que acompanham o produto. Não direcione os disparos de água para o rosto.",
  },
  {
    question: "Quanto tempo leva para chegar?",
    answer:
      `O prazo depende da sua região. O ${FULL_SHIPPING_LABEL} custa ${money(FULL_SHIPPING_CENTS)} para uma unidade, para todo o Brasil. Consulte as informações de entrega e, se precisar receber até uma data específica, fale com o atendimento antes de comprar. Depois do envio, acompanhe o pedido em Rastrear pedido, aqui no site.`,
  },
  {
    question: "Como acompanhar meu pedido ou falar com o suporte?",
    answer:
      "Para acompanhar a entrega, use Rastrear pedido, no rodapé do site, com o código de rastreio enviado na confirmação da compra. Para outras dúvidas, use o contato no rodapé e informe a opção escolhida e, se já comprou, os dados do pedido.",
  },
];
