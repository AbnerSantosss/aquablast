/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 1: 1 unidade — layout, dados, entrega, oferta da 2a unidade e compra com Pix simulado.
const L = require("./_lib.cjs");
const { assert } = L;

async function run(variant = { width: 1440, height: 900, tag: "desktop" }) {
  const { browser, page, requests, pageErrors } = await L.open(variant);
  const pendencias = [];
  try {
    await L.goCheckout(page, "pack=unit&cor=azul");
    await L.noHorizontalScroll(page);
    await L.waitText(page.locator(".ship-bar"), /frete/i);
    // Cabeçalho novo (49f7d26): o selo passou de "Checkout AquaBlast" para "Ambiente protegido"; o nome da loja fica na marca.
    await L.waitText(page.locator(".ck-season-badge"), "Ambiente protegido");
    await L.waitText(page.locator(".ck-checkout-intro"), /Finalize seu pedido\s*Etapa 1 de 3 · Seus dados/);
    assert.equal(await page.locator(".ck-timer").count(), 0, "checkout de verão não deveria mostrar contagem regressiva");
    assert.equal(await page.locator(".ck-steps > li").count(), 3);
    if (variant.mobile) {
      assert.equal(await page.locator(".ck-summary-toggle").getAttribute("aria-expanded"), "false", "resumo mobile deveria iniciar recolhido");
      assert.equal(await page.locator(".ck-summary-details").isVisible(), false, "detalhes deveriam estar recolhidos no celular");
    }
    await L.shot(page, `c1-${variant.tag}-0-primeira-dobra`, false);
    await L.revealSummary(page);
    await L.expectSummaryUnit(page, 1, "azul");
    assert.equal(await L.summaryUnit(page, 2).count(), 0, "1 unidade: só um produto no resumo");
    // Antes de escolher a forma (2026-09-29): Pix em destaque com a economia e a parcela do cartao logo abaixo.
    // Resumo novo (49f7d26): a economia virou a linha "Desconto no Pix" e o destaque a linha "Total no Pix".
    await L.waitText(L.summaryRow(page, "Produtos"), /^R\$ 179,90$/);
    await L.waitText(L.summaryRow(page, "Desconto no Pix"), /^− R\$ 30,00$/);
    await L.waitText(L.summaryRow(page, "Frete FULL"), /^R\$ 9,99$/);
    await L.waitText(L.summaryTotal(page, "pix"), /^R\$ 159,89$/);
    await L.waitText(L.summaryNote(page, /sem juros no cartão/), /^ou 12x de R\$ 15,82 sem juros no cartão$/);
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
    await L.waitText(page.locator(".ship-opt"), /Frete FULL.*Entrega com rastreamento/);
    await L.shot(page, `c1-${variant.tag}-2-entrega`);
    await L.submitEntrega(page);

    await L.waitText(page.locator(".ck-done").nth(1), `${L.endereco.street}, ${L.endereco.number}`);
    await L.waitText(page.locator(".ck-testmode").first(), "Modo de teste");
    assert.ok(await L.payHead(page, "pix").locator('input[value="pix"]').isChecked(), "Pix deveria abrir selecionado");
    assert.equal(await page.locator('.pay-item.is-open input[value="pix"]').count(), 1, "Pix deveria abrir aberto");
    // Desde 2026-10-07 (pedido checkout-prints) o cartão vem antes do Pix na lista e o Pix segue como padrão.
    // Medido pela posição na tela, não pela ordem no HTML. A divergência fica anotada e reprova o cenário no fim,
    // para o resto do fluxo ser exercitado mesmo assim.
    const pixHead = await L.payHead(page, "pix").boundingBox();
    const cardHead = await L.payHead(page, "card").boundingBox();
    if (!(pixHead && cardHead && cardHead.y < pixHead.y))
      pendencias.push(`Cartão deveria aparecer antes do Pix na etapa 3: Pix em y=${pixHead ? Math.round(pixHead.y) : "?"}, cartão em y=${cardHead ? Math.round(cardHead.y) : "?"}`);
    assert.equal(await page.getByText(/boleto/i).count(), 0, "boleto nao deveria aparecer");
    // Desde o 7d1aafa o Pix abre selecionado; escolhendo o cartao, a parcela vira o destaque (unidade no cartao 179,90 + frete 9,99 = 189,89).
    await L.payHead(page, "card").click();
    await L.field(page, "cc-number").waitFor({ timeout: 10000 });
    await L.waitText(L.summaryTotal(page, "card"), /^R\$ 189,89$/);
    assert.equal(await L.summaryTotal(page, "pix").count(), 0, "com o cartão escolhido o destaque não é o Pix");
    assert.equal(await L.summaryRow(page, "Desconto no Pix").count(), 0, "cartão não mostra desconto do Pix como aplicado");
    await L.waitText(L.summaryNote(page, /12x de/), /^12x de R\$ 15,82 sem juros$/);
    await L.waitText(L.summaryNote(page, /à vista no Pix/), /^ou R\$ 159,89 à vista no Pix · R\$ 30,00 de desconto$/);
    await L.shot(page, `c1-${variant.tag}-3-pagamento-cartao`);
    // Pix: o total do Pix vira o destaque e o cartao passa para a linha de baixo.
    await L.choosePix(page);
    await L.waitText(L.summaryTotal(page, "pix"), /^R\$ 159,89$/);
    await L.waitText(L.summaryNote(page, /sem juros no cartão/), /^ou 12x de R\$ 15,82 sem juros no cartão$/);
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
    await L.waitText(L.summaryTotal(page, "pix"), /^R\$ 239,90$/);
    // Antes ".bump-summary" dizia "+ 1 AquaBlast preto … R$ 90,00"; agora a cor aparece como 2º produto e o valor na linha do bump.
    await L.waitText(L.summaryBump(page), /2ª unidade adicionada\s*\+ R\$ 90,00/);
    assert.equal(await L.summaryBump(page).getAttribute("data-summary-bump"), "confirmed");
    await L.expectSummaryUnit(page, 1, "azul", { kit: true });
    await L.expectSummaryUnit(page, 2, "preto", { kit: true });
    await L.noHorizontalScroll(page);

    // A geração informa o total real; depois mantém validade e cópia visíveis.
    await L.btn(page, "Gerar Pix de R$ 239,90").click();
    const code = L.field(page, "pix-code");
    await code.waitFor({ state: "attached", timeout: 15000 });
    assert.match(await code.inputValue(), /^SIMULADO-NAO-PAGUE-sim_/);
    // Antes ".pix-validity" ("Código válido por 10:00"); agora "Expira em" + contagem.
    await L.waitText(page.locator("[data-pix-payment-code]"), "Expira em");
    await L.waitText(L.pixCountdown(page), /^(10:00|09:[45]\d)$/);
    await L.waitText(L.pixCopy(page), "Copiar código Pix");
    await L.pixCopy(page).click();
    await L.waitText(L.pixCopy(page), "Código copiado");
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
    assert.equal(pendencias.length, 0, `fluxo completo passou, mas: ${pendencias.join(" | ")}`);
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
