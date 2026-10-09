/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 5: celular pequeno (360px) - sem rolagem horizontal em nenhuma etapa e alvos de toque >= 44px.
const L = require("./_lib.cjs");
const { assert } = L;

// Alvos menores que 44px ficam anotados e reprovam o cenário no fim: assim uma falha não esconde as medições seguintes.
const pequenos = [];
async function alturaMin(locator, nome) {
  const box = await locator.boundingBox();
  if (!(box && box.height >= 44)) pequenos.push(`${nome}: alvo de toque com ${box ? Math.round(box.height * 10) / 10 : 0}px (< 44)`);
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
    // Pix abre primeiro e selecionado; mantém a escolha explícita como verificação da forma.
    await L.choosePix(page);
    // Desde o a446b8c o clique de abrir a oferta e o botao transparente .bump-open-trigger (cobre o .bump-choice).
    await page.locator(".bump-open-trigger").click();
    await alturaMin(page.getByRole("button", { name: "Continuar só com 1 unidade", exact: true }), "continuar com 1 unidade");
    // Cor da 2a unidade (2026-09-30): obrigatoria; os 3 cartoes de cor precisam caber em 360px com alvo >= 44px.
    await L.noHorizontalScroll(page);
    // Mede no DOM de uma vez: o bloco re-renderiza enquanto a cotacao chega e handles de locator.all() viravam
    // boundingBox null ("alvo de toque com 0px"). ColorPick.tsx tambem usa label.bump-color (cor do produto): so as do bump.
    await page.waitForFunction(() => document.querySelectorAll(".bump-colors label.bump-color").length === 3, null, { timeout: 10000 });
    await page.waitForFunction(() => { const m = document.querySelector("fieldset.pay-acc"); return m && !m.disabled; }, null, { timeout: 15000 });
    for (const h of await page.evaluate(() => [...document.querySelectorAll(".bump-colors label.bump-color")].map((e) => e.getBoundingClientRect().height))) {
      if (h < 44) pequenos.push(`cor da 2a unidade: alvo de toque com ${Math.round(h * 10) / 10}px (< 44)`);
    }
    await page.locator('input[name="bump-color"][value="vermelho"]').check();
    await L.btn(page, "Selecionar segunda unidade com desconto").click();
    const gerarPix = page.locator(".pix-payment-start .pix-primary");
    await alturaMin(gerarPix, "gerar Pix");
    await gerarPix.click();
    const code = L.field(page, "pix-code");
    await code.waitFor({ state: "attached", timeout: 15000 });
    assert.match(await code.inputValue(), /^SIMULADO-NAO-PAGUE-sim_/);
    await alturaMin(L.pixCopy(page), "copiar código Pix");
    await page.locator("[data-pix-qr]").waitFor({ state: "visible" });
    const copiarBox = await L.pixCopy(page).boundingBox();
    const qrBox = await page.locator("[data-pix-qr]").boundingBox();
    assert.ok(copiarBox && qrBox && qrBox.y >= 0 && qrBox.y + qrBox.height <= copiarBox.y && copiarBox.y + copiarBox.height <= page.viewportSize().height, "QR e copiar Pix devem caber juntos na primeira tela");
    await L.noHorizontalScroll(page);
    await L.shot(page, `c5-360-pix`);
    await L.payHead(page, "card").click();
    await L.field(page, "cc-number").waitFor();
    await L.noHorizontalScroll(page);
    for (const nome of ["Editar seus dados", "Editar entrega"]) await alturaMin(L.editStep(page, nome), nome);
    // A barra de progresso (49f7d26) ganhou botões com o mesmo nome: também são alvo de toque.
    for (const nome of ["Editar seus dados", "Editar entrega"]) await alturaMin(L.progressEdit(page, nome), `${nome} (barra de progresso)`);
    await alturaMin(page.locator('.ck-cardform button[type="submit"]'), "pagar com cartão");
    for (const head of await page.locator(".pay-head").all()) await alturaMin(head, ".pay-head");
    await L.shot(page, `c5-360-cartao`);
    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, []);
    assert.equal(pequenos.length, 0, pequenos.join(" | "));
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
