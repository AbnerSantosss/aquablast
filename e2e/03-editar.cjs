/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 3: EDITAR nas etapas concluidas mantem os dados; mexer no endereco pede nova confirmacao do frete.
const L = require("./_lib.cjs");
const { assert } = L;

async function run(variant) {
  const { browser, page, requests, pageErrors } = await L.open(variant);
  try {
    const atual = page.locator(".ck-step[aria-current=step]");
    await L.goCheckout(page);
    await L.fillDados(page);
    await L.submitDados(page);
    await page.getByRole("button", { name: "Editar seus dados" }).click();
    await L.waitText(atual, "Seus dados");
    assert.equal(await L.field(page, "name").inputValue(), L.cliente.name);
    assert.equal(await L.field(page, "phone").inputValue(), "(11) 98765-4321");
    await L.submitDados(page);
    await L.fillEntrega(page);
    await L.submitEntrega(page);
    await page.getByRole("button", { name: "Editar entrega" }).click();
    await L.waitText(atual, "Entrega");
    assert.equal(await L.field(page, "street").inputValue(), L.endereco.street);
    assert.equal(await L.field(page, "number").inputValue(), L.endereco.number);
    assert.equal(await L.field(page, "recipient").inputValue(), L.cliente.name);
    await page.locator(".ship-opt").waitFor({ timeout: 5000 });
    await L.field(page, "number").fill("1001");
    await page.locator(".ship-opt").waitFor({ state: "detached", timeout: 5000 });
    assert.ok(await L.btn(page, "CONFIRMAR ENDEREÇO").isVisible(), "deveria pedir nova confirmacao do endereco");
    await L.shot(page, `c3-${variant.tag}-editar-entrega`);
    await page.getByRole("button", { name: "Editar seus dados" }).click();
    assert.equal(await L.field(page, "email").inputValue(), L.cliente.email);
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
    await L.scenario("03-desktop", "EDITAR mantem os dados (1440)", () => run({ width: 1440, height: 900, tag: "desktop" }));
    await L.scenario("03-mobile", "EDITAR mantem os dados (412 mobile)", () => run({ width: 412, height: 915, tag: "mobile", mobile: true }));
  })();
}
