/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 3: EDITAR mantém os dados; envio revalida endereço sem exigir confirmação intermediária de frete.
const L = require("./_lib.cjs");
const { assert } = L;

async function run(variant) {
  const { browser, page, requests, pageErrors } = await L.open(variant);
  try {
    const atual = page.locator(".ck-step[aria-current=step]");
    await L.goCheckout(page);
    await L.fillDados(page);
    await L.submitDados(page);
    // Desde o 49f7d26 a barra de progresso também tem um botão "Editar seus dados"; L.editStep é o do cartão da etapa (.ck-edit).
    await L.editStep(page, "Editar seus dados").click();
    await L.waitText(atual, "Seus dados");
    assert.equal(await L.field(page, "name").inputValue(), L.cliente.name);
    assert.equal(await L.field(page, "phone").inputValue(), "(11) 98765-4321");
    await L.submitDados(page);
    await L.fillEntrega(page);
    await L.submitEntrega(page);
    await L.editStep(page, "Editar entrega").click();
    await L.waitText(atual, "Entrega");
    assert.equal(await L.field(page, "street").inputValue(), L.endereco.street);
    assert.equal(await L.field(page, "number").inputValue(), L.endereco.number);
    // O resumo ".delivery-recipient-summary" saiu: o destinatário fica sempre no campo, preenchido com o nome do cliente.
    assert.equal(await (await L.revealEntregaField(page, "recipient")).inputValue(), L.cliente.name);
    await page.locator(".ship-opt").waitFor({ timeout: 5000 });
    // Mesmo sem segundo toque de confirmação, um endereço incompleto continua bloqueando a próxima etapa.
    await L.field(page, "number").fill("");
    await L.submitCurrentForm(page);
    await L.waitText(page.locator(".ck-alert"), "Informe o número. Se não houver, escreva S/N.");
    await L.btn(page, "CORRIGIR AGORA").click();
    assert.ok(await L.field(page, "number").evaluate((e) => e === document.activeElement), "foco deveria ir ao número");
    await L.waitText(atual, "Entrega");
    await L.field(page, "number").fill("1001");
    await L.waitText(page.locator(".ship-opt"), /Frete FULL.*Entrega com rastreamento/);
    assert.ok(await L.btn(page, "Ir para pagamento").isVisible(), "deveria haver uma ação direta de avanço");
    await L.shot(page, `c3-${variant.tag}-editar-entrega`);
    await L.submitEntrega(page);
    await L.waitText(page.locator(".ck-done").nth(1), `${L.endereco.street}, 1001`);
    await L.editStep(page, "Editar entrega").click();
    assert.equal(await L.field(page, "number").inputValue(), "1001", "novo número deveria ser preservado");
    // Aqui pelo botão homônimo da barra de progresso (novo no 49f7d26): tem de voltar à etapa 1 com os dados mantidos.
    await L.progressEdit(page, "Editar seus dados").click();
    await L.waitText(atual, "Seus dados");
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
