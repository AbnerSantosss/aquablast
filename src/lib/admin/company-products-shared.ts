/**
 * Produtos do AquaBlast cujo preço é espelho de `checkout.prices` (savePricesSettings -> mirrorDefaultCompanyPrices).
 * No painel de Empresas eles não aceitam mudar preço, slug nem apagar. Fica fora do arquivo de Server Actions
 * porque um módulo "use server" só pode exportar funções assíncronas.
 */
export const MIRRORED_PRODUCT_SLUGS: readonly string[] = ["unit-azul", "unit-vermelho", "unit-preto", "kit"];
