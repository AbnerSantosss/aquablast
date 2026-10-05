import { PRICES } from "@/lib/site/constants";
import type { FaqItem } from "@/lib/site/types";

// Fonte única do FAQ visível, do JSON-LD e do /llms.txt.
// Campanha de verão: somente atributos confirmados; não estimar prazo, alcance ou bateria.
export const faq: FaqItem[] = [
  {
    question: "O que é o AquaBlast?",
    answer:
      "É um brinquedo de água elétrico, do tipo lançador de água, com efeito luminoso de luz LED, bateria recarregável por USB e reservatório em tambor. Você escolhe 1 unidade, nas cores azul, vermelho ou preto, ou o kit com 2.",
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
    question: "Qual opção devo escolher?",
    answer:
      "A unidade é uma opção para começar. O kit reúne dois AquaBlast: um pra você, um pra eles, para compartilhar a brincadeira. Escolha a cor de cada unidade: azul, vermelho ou preto.",
  },
  {
    question: "Quais cores estão disponíveis?",
    answer:
      "A unidade está disponível nas cores azul, vermelho e preto. Toque nas cores na seção de ofertas para visualizar o produto. No kit, você pode escolher a cor de cada um dos dois brinquedos.",
  },
  {
    question: "Quais são as formas de pagamento?",
    answer: `Pix ou cartão de crédito em até 12x sem juros. No cartão, a unidade sai por 12x de ${PRICES.unit.installment} (total ${PRICES.unit.card}) e o kit com 2 por 12x de ${PRICES.kit.installment} (total ${PRICES.kit.card}). No Pix à vista você paga ${PRICES.unit.pix} a unidade e ${PRICES.kit.pix} o kit, com ${PRICES.unit.pixDiscount} de desconto na unidade e ${PRICES.kit.pixDiscount} no kit.`,
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
      "O prazo depende da sua região. O frete é grátis para todo o Brasil. Consulte as informações de entrega e, se precisar receber até uma data específica, fale com o atendimento antes de comprar. Depois do envio, acompanhe o pedido em Rastrear pedido, aqui no site.",
  },
  {
    question: "Como acompanhar meu pedido ou falar com o suporte?",
    answer:
      "Para acompanhar a entrega, use Rastrear pedido, no rodapé do site, com o código de rastreio enviado na confirmação da compra. Para outras dúvidas, use o contato no rodapé e informe a opção escolhida e, se já comprou, os dados do pedido.",
  },
];
