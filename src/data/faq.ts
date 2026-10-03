import { PRICES } from "@/lib/site/constants";
import type { FaqItem } from "@/lib/site/types";

// Fonte única do FAQ: alimenta a seção #duvidas (Faq.tsx), o FAQPage do JSON-LD e o /llms.txt.
// Só fato confirmado (wiki/conteudo/honestidade-e-confirmar.md). Pagamento: checkout Zedy com
// parcelas de 1 a 12 com taxa 0 (conferido em 2026-09-25); frete grátis: opção configurada na
// Zedy em 2026-09-23 (wiki/operacao/aquablast-checkout-zedy.md). Prazo e idade seguem sem número.
export const faq: FaqItem[] = [
  {
    question: "O que é o AquaBlast?",
    answer:
      "É um brinquedo de água elétrico, do tipo lançador de água, com efeito luminoso de luz LED, bateria recarregável por USB e reservatório em tambor. Você escolhe 1 unidade, nas cores azul, vermelho ou preto, ou o kit com 2.",
  },
  {
    question: "O AquaBlast é um bom presente de Dia das Crianças?",
    answer:
      "Sim. É um brinquedo de água para brincar ao ar livre, no quintal ou no jardim, com luz LED e bateria recarregável por USB. É um presente para filho, neto ou sobrinho, e o kit com 2 deixa a brincadeira a dois. Confira a indicação de idade na embalagem antes de presentear.",
  },
  {
    question: "Qual opção devo escolher?",
    answer:
      "A unidade é ideal para presentear uma criança. O kit reúne dois AquaBlast para compartilhar a brincadeira. Escolha a cor de cada unidade: azul, vermelho ou preto.",
  },
  {
    question: "Quais cores estão disponíveis?",
    answer:
      "A unidade está disponível nas cores azul, vermelho e preto. Toque nas cores na seção de ofertas para visualizar o produto. No kit, você pode escolher a cor de cada um dos dois brinquedos.",
  },
  {
    question: "Quais são as formas de pagamento?",
    answer: `Pix ou cartão de crédito em até 12x sem juros. No cartão, a unidade sai por 12x de ${PRICES.unit.installment} (total ${PRICES.unit.card}) e o kit com 2 por 12x de ${PRICES.kit.installment} (total ${PRICES.kit.card}). No Pix à vista você paga ${PRICES.unit.pix} a unidade e ${PRICES.kit.pix} o kit, com ${PRICES.unit.pixDiscount} de desconto.`,
  },
  {
    question: "Para qual idade o brinquedo é indicado?",
    answer:
      "Confira a indicação de idade na embalagem antes de presentear. A brincadeira deve ter supervisão de um adulto e seguir as orientações do fabricante.",
  },
  {
    question: "Como recarregar e usar o AquaBlast?",
    answer:
      "A bateria é recarregável por cabo USB e a água vai no tambor. Siga as instruções de carga, abastecimento e conservação que acompanham o produto. O tempo de bateria varia conforme o uso. Não direcione o jato para o rosto.",
  },
  {
    question: "Qual é o prazo de entrega?",
    answer:
      "O prazo depende do CEP. Ao informar o CEP no checkout, você vê as opções de frete disponíveis antes de pagar, incluindo frete grátis para todo o Brasil. Se o presente for para uma data comemorativa, confira o prazo antes de concluir o pedido.",
  },
  {
    question: "Como acompanhar meu pedido ou falar com o suporte?",
    answer:
      "Para acompanhar a entrega, use Rastrear pedido, no rodapé do site, com o código de rastreio enviado na confirmação da compra. Para outras dúvidas, use o contato no rodapé e informe a opção escolhida e, se já comprou, os dados do pedido.",
  },
];
