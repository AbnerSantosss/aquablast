/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 4: CEP nao encontrado (ViaCEP responde erro) -> preenchimento manual com cidade e estado.
const L = require("./_lib.cjs");
const { assert } = L;

async function run(variant) {
  const { browser, page, requests, pageErrors } = await L.open({ ...variant, viacep: "erro" });
  try {
    await L.goCheckout(page);
    await L.fillDados(page);
    await L.submitDados(page);
    await L.field(page, "cep").fill("99999999");
    await L.waitText(page.locator(".cep-manual"), "Não encontramos o CEP automaticamente. Preencha o endereço abaixo.");
    const street = L.field(page, "street");
    assert.ok(await street.isEnabled());
    await page.waitForFunction(() => document.activeElement?.getAttribute("name") === "street", null, { timeout: 5000 });
    assert.equal(await street.inputValue(), "");
    await street.fill("Rua dos Andradas");
    await L.field(page, "number").fill("50");
    await L.field(page, "district").fill("Centro Histórico");
    await L.field(page, "city").fill("Porto Alegre");
    const rec = L.field(page, "recipient");
    if (!(await rec.inputValue())) await rec.fill(L.cliente.name);
    await L.btn(page, "CONFIRMAR ENDEREÇO").click();
    await L.waitText(page.locator("p.error"), "Selecione o estado.");
    // Popup explicito (2026-10-02): o foco fica no popup; "CORRIGIR AGORA" fecha e leva o foco ao estado.
    await L.btn(page, "CORRIGIR AGORA").click();
    assert.ok(await page.locator(".state-select").evaluate((e) => e === document.activeElement), "foco deveria ir ao estado");
    await L.shot(page, `c4-${variant.tag}-cep-manual-erro-estado`);
    await page.locator(".state-select").selectOption("RS");
    await L.btn(page, "CONFIRMAR ENDEREÇO").click();
    await L.waitText(page.locator(".ship-opt"), "FRETE GRÁTIS");
    await L.btn(page, "CONTINUAR").click();
    await L.waitText(page.locator(".ck-step[aria-current=step]"), "Pagamento");
    const done1 = page.locator(".ck-done").nth(1);
    await L.waitText(done1, "Rua dos Andradas, 50");
    await L.waitText(done1, "Porto Alegre - RS | CEP: 99999-999");
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
    await L.scenario("04-desktop", "CEP manual com cidade e estado (1440)", () => run({ width: 1440, height: 900, tag: "desktop" }));
    await L.scenario("04-mobile", "CEP manual com cidade e estado (412 mobile)", () => run({ width: 412, height: 915, tag: "mobile", mobile: true }));
  })();
}
