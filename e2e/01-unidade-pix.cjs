/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 1: 1 unidade — layout, dados, entrega, oferta da 2a unidade e compra com Pix simulado.
const L = require("./_lib.cjs");
const { assert } = L;

async function run(variant = { width: 1440, height: 900, tag: "desktop" }) {
  const { browser, page, requests, pageErrors } = await L.open(variant);
  try {
    await L.goCheckout(page, "pack=unit&cor=azul");
    await L.noHorizontalScroll(page);
    await L.waitText(page.locator(".ship-bar"), /frete/i);
    await L.waitText(page.locator(".ck-timer"), /Oferta Dia das Crianças termina em:/);
    assert.equal(await page.locator(".ck-steps > li").count(), 3);
    await L.waitText(page.locator(".selected-product"), "Cor azul");
    // Antes de escolher a forma (2026-09-28): parcela do cartao em destaque e o Pix com desconto logo abaixo.
    await L.waitText(page.locator(".order-summary .total"), /12x de R\$ 14,16 ?sem juros no cartão · total R\$ 169,90/);
    await L.waitText(page.locator(".order-summary .total-alt.is-pix"), /ou R\$ 159,90 à vista no Pix ?R\$ 10,00 de desconto/);
    assert.ok(await L.field(page, "name").isVisible());
    await L.shot(page, `c1-${variant.tag}-0-primeira-dobra`, false);

    // Validacao de conforto: celular incompleto nao passa.
    await L.fillDados(page);
    await L.field(page, "phone").fill("119876");
    await L.btn(page, "CONTINUAR").click();
    await L.waitText(page.locator("p.error"), "Informe um celular válido com DDD: (00) 00000-0000.");
    await L.field(page, "phone").fill(L.cliente.phone);
    await L.shot(page, `c1-${variant.tag}-1-dados`);
    await L.submitDados(page);

    const done0 = page.locator(".ck-done").nth(0);
    await L.waitText(done0, L.cliente.name);
    await L.waitText(done0, L.cliente.email);
    await L.shot(page, `c1-${variant.tag}-2a-entrega-vazia`);
    await L.fillEntrega(page);
    await L.btn(page, "CONFIRMAR ENDEREÇO").click();
    await L.waitText(page.locator(".ship-opt"), /Frete FULL.*FRETE GRÁTIS/);
    await L.shot(page, `c1-${variant.tag}-2-entrega`);
    await L.btn(page, "CONTINUAR").click();
    await page.locator(".pay-acc").waitFor({ timeout: 10000 });

    await L.waitText(page.locator(".ck-done").nth(1), `${L.endereco.street}, ${L.endereco.number}`);
    await L.waitText(page.locator(".ck-testmode").first(), "Modo de teste");
    assert.equal(await page.getByText(/boleto/i).count(), 0, "boleto nao deveria aparecer");
    // Cartao abre selecionado quando esta ligado (2026-09-28): parcela em destaque (unidade no cartao 169,90).
    assert.ok(await page.locator('input[name="pay-method"][value="card"]').isChecked(), "cartao deveria abrir selecionado");
    await L.field(page, "cc-number").waitFor({ timeout: 10000 });
    await L.waitText(page.locator(".order-summary .total"), /12x de R\$ 14,16 ?sem juros no cartão · total R\$ 169,90/);
    await L.waitText(page.locator(".order-summary .total-alt.is-pix"), /ou R\$ 159,90 à vista no Pix/);
    await L.shot(page, `c1-${variant.tag}-3-pagamento-cartao`);
    // Pix: o total do Pix vira o destaque e o cartao passa para a linha de baixo.
    await L.choosePix(page);
    await L.waitText(page.locator(".order-summary .total"), /R\$ 159,90 ?à vista no Pix/);
    await L.waitText(page.locator(".order-summary .total-alt"), /ou 12x de R\$ 14,16 sem juros no cartão/);
    await L.shot(page, `c1-${variant.tag}-3-pagamento`);

    // Order bump: 2a unidade pela diferenca ate o kit (valor vem do servidor).
    await L.waitText(page.locator(".bump-choice"), "SIM, QUERO ADICIONAR A SEGUNDA UNIDADE");
    await L.waitText(page.locator(".order-bump .bump-price"), "+ R$ 90,00");
    await page.locator(".bump-choice").click();
    await L.waitText(page.locator(".bump-choice"), "ADICIONADO AO PEDIDO");
    await L.waitText(page.locator(".order-summary .total b"), "R$ 249,90");
    await L.waitText(page.locator(".bump-summary"), /\+ 1 AquaBlast azul.*R\$ 90,00/);
    await L.noHorizontalScroll(page);

    await L.btn(page, "FINALIZAR COMPRA").click();
    const code = L.field(page, "pix-code");
    await code.waitFor({ timeout: 15000 });
    assert.match(await code.inputValue(), /^SIMULADO-NAO-PAGUE-sim_/);
    await L.waitText(page.locator(".ck-pix-timer"), /Expira em (10:00|09:[45]\d)/);
    assert.equal(await page.locator(".ck-pix-steps li").count(), 3);
    await L.btn(page, "Copiar código").click();
    await L.waitText(page.locator(".ck-copied"), "Código copiado");
    await L.shot(page, `c1-${variant.tag}-4-pix-gerado`);

    await L.btn(page, "Simular pagamento aprovado").click();
    await page.waitForURL(/\/checkout\/pedido\//, { timeout: 15000 });
    // Tela de compra confirmada (2026-09-28): nao mostra mais total nem e-mail, so o numero do pedido e as etapas.
    await L.waitText(page.locator(".oc-hero"), /Obrigado pela sua compra, \S+!/);
    await L.waitText(page.locator(".oc-summary"), /Total\s*R\$/);
    await L.waitText(page.locator(".oc-summary"), /Enviamos a confirmação para \S+@/);
    assert.equal(await page.locator(".oc-step.is-current strong").textContent(), "Compra aprovada");
    await L.waitText(page.locator(".oc-order"), /AQB-/);
    assert.equal(await page.locator(".oc-step.is-done").count(), 2, "pedido pago comeca com 2 etapas concluidas");
    await L.noHorizontalScroll(page);
    await L.shot(page, `c1-${variant.tag}-6-sucesso-pix`);
    const publicToken = page.url().split("/").pop();

    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, [], "erro de JavaScript na pagina");
    return { publicToken };
  } finally {
    await browser.close();
  }
}

module.exports = { run };

if (require.main === module) {
  (async () => {
    await L.clearRateLimits();
    await L.scenario("01-desktop", "1 unidade + bump + Pix simulado (1440)", async () => {
      const r = await run({ width: 1440, height: 900, tag: "desktop" });
      return `pedido ${r.publicToken.slice(0, 6)}…`;
    });
    await L.scenario("01-mobile", "1 unidade + bump + Pix simulado (412, mobile)", async () => {
      await run({ width: 412, height: 915, tag: "mobile", mobile: true });
    });
  })();
}
