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
    await L.waitText(page.locator(".ck-season-badge"), "Checkout AquaBlast");
    assert.equal(await page.locator(".ck-timer").count(), 0, "checkout de verão não deveria mostrar contagem regressiva");
    assert.equal(await page.locator(".ck-steps > li").count(), 3);
    if (variant.mobile) {
      assert.equal(await page.locator(".ck-summary-toggle").getAttribute("aria-expanded"), "false", "resumo mobile deveria iniciar recolhido");
      assert.equal(await page.locator(".ck-summary-details").isVisible(), false, "detalhes deveriam estar recolhidos no celular");
    }
    await L.shot(page, `c1-${variant.tag}-0-primeira-dobra`, false);
    await L.revealSummary(page);
    await L.waitText(page.locator(".selected-product"), "Cor azul");
    // Antes de escolher a forma (2026-09-29): Pix em destaque com a economia e a parcela do cartao logo abaixo.
    await L.waitText(page.locator(".order-summary .total"), /^(?=[\s\S]*À vista\s*no Pix)(?=[\s\S]*Economize R\$ 20,00)(?=[\s\S]*R\$ 159,90)/);
    await L.waitText(page.locator(".order-summary .total-alt"), /ou 12x de R\$ 14,99 sem juros no cartão/);
    assert.ok(await L.field(page, "name").isVisible());

    // Validacao de conforto: celular incompleto nao passa.
    await L.fillDados(page);
    await L.field(page, "phone").fill("119876");
    await L.submitCurrentForm(page);
    // Popup explicito (2026-10-02): diz quantos digitos faltam; fechar leva o foco ao campo. A mesma frase fica na caixa da etapa.
    await L.waitText(page.locator(".ck-alert"), /O celular está incompleto: você digitou 6 número\(s\), são 11/);
    await L.btn(page, "CORRIGIR AGORA").click();
    assert.equal(await page.locator(".ck-alert").count(), 0, "popup deveria fechar");
    assert.ok(await L.field(page, "phone").evaluate((e) => e === document.activeElement), "foco deveria ir ao celular");
    await L.waitText(page.locator("p.error"), "O celular está incompleto");
    await L.waitText(page.locator("#ck-phone-error"), "O celular está incompleto");
    assert.match(await L.field(page, "phone").getAttribute("aria-describedby"), /ck-phone-error/, "erro deveria estar associado ao celular");
    await L.field(page, "phone").fill(L.cliente.phone);
    await L.shot(page, `c1-${variant.tag}-1-dados`);
    await L.submitDados(page);

    const done0 = page.locator(".ck-done").nth(0);
    await L.waitText(done0, L.cliente.name);
    await L.waitText(done0, L.cliente.email);
    await L.shot(page, `c1-${variant.tag}-2a-entrega-vazia`);
    await L.fillEntrega(page);
    await L.waitText(page.locator(".ship-opt"), /Frete grátis.*Entrega com rastreamento/);
    await L.shot(page, `c1-${variant.tag}-2-entrega`);
    await L.submitEntrega(page);

    await L.waitText(page.locator(".ck-done").nth(1), `${L.endereco.street}, ${L.endereco.number}`);
    await L.waitText(page.locator(".ck-testmode").first(), "Modo de teste");
    assert.ok(await page.locator('.pay-item').first().locator('input[value="pix"]').isChecked(), "Pix deveria aparecer primeiro e selecionado");
    assert.equal(await page.getByText(/boleto/i).count(), 0, "boleto nao deveria aparecer");
    // Desde o 7d1aafa o Pix abre selecionado; escolhendo o cartao, a parcela vira o destaque (unidade no cartao 179,90).
    await L.payHead(page, "card").click();
    await L.field(page, "cc-number").waitFor({ timeout: 10000 });
    await L.waitText(page.locator(".order-summary .total"), /Total no cartão\s*12x de R\$ 14,99\s*sem juros no cartão/);
    await L.waitText(page.locator(".order-summary .total-alt.is-pix"), /ou R\$ 159,90 à vista no Pix/);
    await L.shot(page, `c1-${variant.tag}-3-pagamento-cartao`);
    // Pix: o total do Pix vira o destaque e o cartao passa para a linha de baixo.
    await L.choosePix(page);
    await L.waitText(page.locator(".order-summary .total"), /^(?=[\s\S]*À vista\s*no Pix)(?=[\s\S]*R\$ 159,90)/);
    await L.waitText(page.locator(".order-summary .total-alt"), /ou 12x de R\$ 14,99 sem juros no cartão/);
    await L.shot(page, `c1-${variant.tag}-3-pagamento`);

    // Order bump: 2a unidade pela diferenca ate o kit (valor vem do servidor).
    // Desde o a446b8c: abrir a oferta, escolher a cor (sem cor pre-escolhida; aqui preto, diferente da 1a) e confirmar.
    await L.waitText(page.locator(".bump-choice"), "QUERO APROVEITAR O DESCONTO");
    await L.waitText(page.locator(".order-bump .bump-price"), "+ R$ 90,00");
    await page.locator(".bump-open-trigger").click();
    await L.waitText(page.locator(".bump-choice"), "ESCOLHA SUA SEGUNDA UNIDADE");
    await page.locator('input[name="bump-color"][value="preto"]').check();
    await L.btn(page, "Selecionar segunda unidade com desconto").click();
    await L.waitText(page.locator(".bump-choice"), "SEGUNDA UNIDADE SELECIONADA");
    await L.waitText(page.locator(".order-summary .total b"), "R$ 249,90");
    await L.waitText(page.locator(".bump-summary"), /\+ 1 AquaBlast preto.*R\$ 90,00/);
    await L.noHorizontalScroll(page);

    // A geração informa o total real; depois mantém validade e cópia visíveis.
    await L.btn(page, "Gerar Pix de R$ 249,90").click();
    const code = L.field(page, "pix-code");
    await code.waitFor({ timeout: 15000 });
    assert.match(await code.inputValue(), /^SIMULADO-NAO-PAGUE-sim_/);
    await L.waitText(page.locator(".pix-validity"), /Código válido por (10:00|09:[45]\d)/);
    await page.locator(".pix-code-area .pix-primary").click();
    await L.waitText(page.locator(".pix-code-area .pix-primary"), "Código copiado");
    await L.shot(page, `c1-${variant.tag}-4-pix-gerado`);

    await L.btn(page, "Simular pagamento aprovado").click();
    await page.waitForURL(/\/checkout\/pedido\//, { timeout: 15000 });
    // Compra confirmada: número, total, e-mail e etapas do pedido.
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
