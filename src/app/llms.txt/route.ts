import { faq } from "@/data/faq";
import { BRAND_NAME, CONTACT_EMAIL, PRICES } from "@/lib/site/constants";
import { RETURN_POLICY_DAYS, RETURNS_URL, SITE_URL } from "@/lib/site/seo";

// Gerado no build a partir das mesmas constantes da página (preços, FAQ, contato).
// Opcional e de baixo custo (base "05 - SEO e IA", conceito llms-txt): não substitui
// robots, sitemap, Open Graph e JSON-LD. Só fatos que o site já diz; sem /rastrear e /admin.
// E-mail de contato confirmado pelo dono em 2026-09-26 (CONTACT_EMAIL).
export const dynamic = "force-static";

function buildLlmsTxt(): string {
  const home = `${SITE_URL}/`;
  const lines = [
    `# ${BRAND_NAME}`,
    "",
    `> ${BRAND_NAME} é uma pistola de água elétrica com efeito luminoso de luz LED, bateria recarregável por USB e reservatório em tambor. A loja vende 1 unidade, nas cores azul, vermelho ou preto, ou o kit com 2.`,
    "",
    "## Produto",
    "",
    "- Pistola de água elétrica com efeito luminoso (luz LED).",
    "- Bateria recarregável por USB.",
    "- Reservatório em tambor.",
    "- Cores: azul, vermelho e preto.",
    `- Opções: 1 unidade por ${PRICES.unit.pix} ou kit com 2 por ${PRICES.kit.pix}.`,
    "- Pagamento: Pix ou cartão de crédito em até 12x sem juros, com o mesmo preço nas duas formas.",
    "",
    "## Loja",
    "",
    `- [${BRAND_NAME}](${home}): página do produto com fotos, opções de compra e dúvidas frequentes`,
    `- [Ofertas](${home}#ofertas): 1 unidade ou kit com 2, com preço e escolha de cor`,
    `- [Dúvidas frequentes](${home}#duvidas): pagamento, entrega, cores, uso e suporte`,
    `- [Trocas e devoluções](${RETURNS_URL}): produto que chegar quebrado ou com defeito é substituído sem custo para o cliente; desistência da compra em até ${RETURN_POLICY_DAYS} dias após o recebimento (art. 49 do Código de Defesa do Consumidor), com o frete de devolução por conta da loja; como solicitar e como funciona o reembolso`,
    "",
    "## Contato",
    "",
    `- E-mail: ${CONTACT_EMAIL} (dúvidas, trocas e devoluções; informe o número do pedido, se já comprou)`,
    "",
    "## Perguntas frequentes",
    "",
    ...faq.flatMap((item) => [`### ${item.question}`, "", item.answer, ""]),
  ];
  return lines.join("\n");
}

export function GET(): Response {
  return new Response(buildLlmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
