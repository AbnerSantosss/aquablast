import { buildFaq } from "@/data/faq";
import { money } from "@/lib/checkout/own/masks";
import { FULL_SHIPPING_CENTS, FULL_SHIPPING_LABEL } from "@/lib/checkout/own/shipping";
import { BRAND_NAME, CONTACT_EMAIL } from "@/lib/site/constants";
import type { SitePrices } from "@/lib/site/prices";
import { getSitePrices } from "@/lib/site/prices-server";
import { RETURN_POLICY_DAYS, RETURNS_URL, SITE_URL } from "@/lib/site/seo";

// Gerado no build a partir das mesmas fontes da página (preços do painel, FAQ, contato) e refeito no máximo
// a cada 5 min, como a home: o build do CI não tem banco e sai com os preços de reserva.
// Opcional e de baixo custo (base "05 - SEO e IA", conceito llms-txt): não substitui
// robots, sitemap, Open Graph e JSON-LD. Só fatos que o site já diz; sem /rastrear e /admin.
// E-mail de contato confirmado pelo dono em 2026-09-26 (CONTACT_EMAIL).
export const dynamic = "force-static";
export const revalidate = 300;

function buildLlmsTxt(prices: SitePrices): string {
  const n = prices.installments;
  const discount = prices.unit.pixDiscount ? ` com ${prices.unit.pixDiscount} de desconto` : "";
  const home = `${SITE_URL}/`;
  const lines = [
    `# ${BRAND_NAME}`,
    "",
    `> ${BRAND_NAME} é um brinquedo de água elétrico (lançador de água) com efeito luminoso de luz LED, bateria recarregável por USB e reservatório em tambor. Há opções de uma unidade ou kit com duas, nas cores azul, vermelho e preto.`,
    "",
    "## Produto",
    "",
    "- Brinquedo de água elétrico (lançador de água) com efeito luminoso (luz LED).",
    "- Diversão de verão para brincar em família no quintal e na piscina.",
    "- Bateria recarregável por USB.",
    "- Reservatório em tambor.",
    "- Cores: azul, vermelho e preto.",
    `- Ofertas: 1 unidade por ${prices.unit.pix} no Pix ou kit com duas por ${prices.kit.pix} no Pix, com frete grátis no kit.`,
    `- Entrega: ${FULL_SHIPPING_LABEL} de ${money(FULL_SHIPPING_CENTS)} para uma unidade, para todo o Brasil. O frete é somado ao preço do produto no checkout.`,
    n > 1
      ? `- Pagamento: cartão de crédito em até ${n}x sem juros (${n}x de ${prices.unit.installment}, total ${prices.unit.card}) ou Pix à vista${discount}.`
      : `- Pagamento: cartão de crédito (${prices.unit.card}) ou Pix à vista${discount}.`,
    "",
    "## Loja",
    "",
    `- [${BRAND_NAME}](${home}): página do produto com fotos, oferta e dúvidas frequentes`,
    `- [Oferta](${home}#ofertas): unidade ou kit com duas, com preços e escolha de cores`,
    `- [Dúvidas frequentes](${home}#duvidas): pagamento, entrega, cores, uso e suporte`,
    `- [Trocas e devoluções](${RETURNS_URL}): produto que chegar quebrado ou com defeito é substituído sem custo para o cliente; desistência da compra em até ${RETURN_POLICY_DAYS} dias após o recebimento (art. 49 do Código de Defesa do Consumidor), com o frete de devolução por conta da loja; como solicitar e como funciona o reembolso`,
    "",
    "## Contato",
    "",
    `- E-mail: ${CONTACT_EMAIL} (dúvidas, trocas e devoluções; informe o número do pedido, se já comprou)`,
    "",
    "## Perguntas frequentes",
    "",
    ...buildFaq(prices).flatMap((item) => [`### ${item.question}`, "", item.answer, ""]),
  ];
  return lines.join("\n");
}

export async function GET(): Promise<Response> {
  return new Response(buildLlmsTxt(await getSitePrices()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
