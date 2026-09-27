/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 2: kit com 2 — economia e cartao (Luhn, validade, nome, CPF do titular, recusado e aprovado).
// Cartoes de teste publicos do gateway simulado; nunca impressos nem gravados.
const L = require("./_lib.cjs");
const { assert } = L;

async function cartao(page, numero, { nome = "MARIA T SILVA", validade = "1230", cvv = "123", cpf = L.cliente.cpf } = {}) {
  await L.field(page, "cc-number").fill(numero);
  await L.field(page, "cc-exp").fill(validade);
  await L.field(page, "cc-csc").fill(cvv);
  await L.field(page, "cc-name").fill(nome);
  await L.field(page, "cc-cpf").fill(cpf);
}

async function run(variant) {
  const { browser, page, requests, pageErrors } = await L.open(variant);
  try {
    await L.goCheckout(page, "pack=kit&cor1=azul&cor2=preto");
    await L.waitText(page.locator(".selected-product"), "Kit com 2 AquaBlast");
    await L.waitText(page.locator(".selected-product .offer s"), /^De R\$ [\d.,]+$/);
    await L.waitText(page.locator(".save-tag"), /^ECONOMIZE R\$ [\d.,]+$/);
    await L.waitText(page.locator(".order-summary .total b"), "R$ 249,90");
    await L.fillDados(page);
    await L.submitDados(page);
    await L.fillEntrega(page);
    await L.submitEntrega(page);
    assert.equal(await page.locator(".order-bump").count(), 0, "kit nao tem oferta da 2a unidade");

    await page.locator(".pay-head", { hasText: "Cartão de crédito" }).click();
    await L.waitText(page.locator(".ck-card-warn"), "Não use um cartão real.");
    assert.equal(await L.field(page, "cc-number").getAttribute("autocomplete"), "cc-number");
    assert.equal(await L.field(page, "cc-number").getAttribute("inputmode"), "numeric");
    assert.equal(await L.field(page, "cc-cpf").inputValue(), "");
    await L.waitText(page.locator(".order-summary .total"), /12x R\$ 21,66.*\(ou R\$ 259,90 à vista\)/);

    // Luhn invalido: mascara, bandeira e foco no numero.
    await cartao(page, L.CARD_BAD_LUHN);
    assert.equal(await L.field(page, "cc-exp").inputValue(), "12/30");
    assert.equal(await L.field(page, "cc-cpf").inputValue(), "529.982.247-25");
    await L.waitText(page.locator(".ck-brand"), "· Visa");
    await L.btn(page, "FINALIZAR COMPRA").click();
    await L.waitText(page.locator(".ck-cardform p.error"), "Número do cartão inválido. Confira os dígitos.");
    assert.ok(await L.field(page, "cc-number").evaluate((e) => e === document.activeElement), "foco deveria ir ao numero");

    await cartao(page, L.CARD_OK, { validade: "0120" });
    await L.btn(page, "FINALIZAR COMPRA").click();
    await L.waitText(page.locator(".ck-cardform p.error"), "Validade inválida ou vencida");
    assert.ok(await L.field(page, "cc-exp").evaluate((e) => e === document.activeElement));

    await cartao(page, L.CARD_OK, { nome: "MARIA" });
    await L.btn(page, "FINALIZAR COMPRA").click();
    await L.waitText(page.locator(".ck-cardform p.error"), "nome e sobrenome");
    assert.ok(await L.field(page, "cc-name").evaluate((e) => e === document.activeElement));

    await cartao(page, L.CARD_OK, { cpf: "52998224724" });
    await L.btn(page, "FINALIZAR COMPRA").click();
    await L.waitText(page.locator(".ck-cardform p.error"), "Confira o CPF do titular do cartão.");
    assert.ok(await L.field(page, "cc-cpf").evaluate((e) => e === document.activeElement));

    // Parcelas: 12x por padrao; da para trocar.
    const inst = L.field(page, "cc-installments");
    const selText = () => inst.evaluate((s) => s.options[s.selectedIndex].text.replace(/\s+/g, " ").trim());
    assert.match(await selText(), /^12x de R\$\s21,66 sem juros$/);
    await inst.selectOption("3");
    assert.match(await selText(), /^3x de R\$\s86,63 sem juros$/);
    await inst.selectOption("12");

    // Recusado pelo simulado: mensagem do gateway, numero e CVV limpos.
    await cartao(page, L.CARD_REFUSED);
    await L.btn(page, "FINALIZAR COMPRA").click();
    await L.waitText(page.locator(".ck-cardform p.error"), /não autorizado|recusad/i, 15000);
    assert.equal(await L.field(page, "cc-csc").inputValue(), "");
    assert.equal(await L.field(page, "cc-number").inputValue(), "");
    await L.shot(page, `c2-${variant.tag}-5-cartao-recusado`);

    // Aprovado.
    await cartao(page, L.CARD_OK);
    await L.btn(page, "FINALIZAR COMPRA").click();
    await page.waitForURL(/\/checkout\/pedido\//, { timeout: 20000 });
    const ok = page.locator(".ck-success");
    await L.waitText(ok, "Pedido confirmado!");
    await L.waitText(ok, /Cartão Visa final 4242 em 12x de R\$ 21,66 sem juros/);
    await L.waitText(ok, "Kit com 2 AquaBlast");
    await L.waitText(ok, "Frete FULL grátis · Com código de rastreamento");
    assert.equal(await page.locator("input[name^=cc-]").count(), 0, "campos do cartao deveriam sumir");
    assert.equal(await page.locator(".ck-step[aria-current=step]").count(), 0);
    assert.equal(await page.getByRole("button", { name: /^Editar/ }).count(), 0);
    await L.noHorizontalScroll(page);
    await L.shot(page, `c2-${variant.tag}-6-sucesso-cartao`);
    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, []);
    return page.url().split("/").pop();
  } finally {
    await browser.close();
  }
}

module.exports = { run };

if (require.main === module) {
  (async () => {
    await L.clearRateLimits();
    await L.scenario("02-desktop", "Kit + cartao (Luhn, validade, nome, CPF, recusado, aprovado) 1440", () => run({ width: 1440, height: 900, tag: "desktop" }).then(() => ""));
    await L.clearRateLimits();
    await L.scenario("02-mobile", "Kit + cartao 412 mobile", () => run({ width: 412, height: 915, tag: "mobile", mobile: true }).then(() => ""));
  })();
}
