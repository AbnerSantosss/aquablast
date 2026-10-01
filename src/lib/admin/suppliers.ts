/**
 * Atalhos de fornecedor na página do pedido (/admin/pedidos/[id]): a loja é dropshipping e compra cada pedido no
 * fornecedor. Em 2026-09-30 a pesquisa não conseguiu confirmar nenhum anúncio da Shopee como o mesmo modelo (a
 * Shopee bloqueia robô com captcha), então ficam buscas prontas, mais vendidos primeiro. Quando o dono escolher os
 * anúncios, troque `href` pelo link do anúncio (wiki: pedidos/2026-09-30-admin-pedido-copiar-dados-fornecedor).
 * O modelo: estilo Desert Eagle, silenciador com LED, mira "SEAWOLF", tambor transparente embaixo do cabo.
 */
export interface SupplierLink {
  label: string;
  href: string;
  note: string;
}

const search = (q: string) => `https://shopee.com.br/search?keyword=${encodeURIComponent(q)}&sortBy=sales`;

export const SUPPLIER_LINKS: SupplierLink[] = [
  { label: "Shopee: Desert Eagle com tambor", href: search("pistola de agua eletrica desert eagle tambor"), note: "busca mais certeira para o modelo" },
  { label: "Shopee: silenciador e mira", href: search("pistola de agua eletrica silenciador mira"), note: "se a primeira vier vazia" },
  { label: "Shopee: lançador de água elétrico LED", href: search("lancador de agua eletrico led recarregavel tambor"), note: "busca mais ampla" },
];
