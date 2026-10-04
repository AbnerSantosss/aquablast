/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 5: celular pequeno (360px) - sem rolagem horizontal em nenhuma etapa e alvos de toque >= 44px.
const L = require("./_lib.cjs");
const { assert } = L;

async function alturaMin(locator, nome) {
  const box = await locator.boundingBox();
  assert.ok(box && box.height >= 44, `${nome}: alvo de toque com ${box ? box.height : 0}px (< 44)`);
}

async function run(variant) {
  const { browser, page, requests, pageErrors } = await L.open(variant);
  try {
    await L.goCheckout(page);
    await L.noHorizontalScroll(page);
    await L.fillDados(page);
    await L.submitDados(page);
    await L.noHorizontalScroll(page);
    await L.fillEntrega(page);
    await L.submitEntrega(page);
    await L.noHorizontalScroll(page);
    // Cartao abre selecionado por padrao (2026-09-28): escolhe o Pix para gerar o codigo.
    await L.choosePix(page);
    // Desde o a446b8c o clique de abrir a oferta e o botao transparente .bump-open-trigger (cobre o .bump-choice).
    await page.locator(".bump-open-trigger").click();
    // Cor da 2a unidade (2026-09-30): obrigatoria; os 3 cartoes de cor precisam caber em 360px com alvo >= 44px.
    await L.noHorizontalScroll(page);
    for (const opt of await page.locator("label.bump-color").all()) await alturaMin(opt, "cor da 2a unidade");
    await page.locator('input[name="bump-color"][value="vermelho"]').check();
    await L.btn(page, "Selecionar segunda unidade com desconto").click();
    await page.locator(".pix-payment-start .pix-primary").click();
    const code = L.field(page, "pix-code");
    await code.waitFor({ timeout: 15000 });
    assert.match(await code.inputValue(), /^SIMULADO-NAO-PAGUE-sim_/);
    await L.noHorizontalScroll(page);
    await L.shot(page, `c5-360-pix`);
    await L.payHead(page, "card").click();
    await L.field(page, "cc-number").waitFor();
    await L.noHorizontalScroll(page);
    for (const nome of ["Editar seus dados", "Editar entrega", "FINALIZAR COMPRA"]) await alturaMin(page.getByRole("button", { name: nome }), nome);
    for (const head of await page.locator(".pay-head").all()) await alturaMin(head, ".pay-head");
    await L.shot(page, `c5-360-cartao`);
    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
}

module.exports = { run };

if (require.main === module) {
  (async () => {
    await L.clearRateLimits();
    await L.scenario("05-360", "Celular 360px: sem rolagem horizontal e alvos >= 44px", () => run({ width: 360, height: 740, tag: "360", mobile: true }));
  })();
}
