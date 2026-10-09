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

async function abrirResumo(page) {
  const toggle = page.locator(".ck-summary-toggle");
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
}

async function erroDoCampo(page, name, message) {
  const input = L.field(page, name);
  await L.waitText(page.locator(".ck-cardform .ck-card-field-error"), message);
  assert.equal(await input.getAttribute("aria-invalid"), "true", `${name}: erro associado ao campo`);
  const errorId = await input.getAttribute("aria-describedby");
  assert.ok(errorId, `${name}: faltou aria-describedby`);
  await L.waitText(page.locator(`[id="${errorId}"]`), message);
  await page.waitForFunction((n) => document.activeElement?.getAttribute("name") === n, name);
  assert.ok(await input.evaluate((e) => e === document.activeElement), `foco deveria ir para ${name}`);
}

async function run(variant) {
  const { browser, page, requests, pageErrors } = await L.open(variant);
  try {
    await L.goCheckout(page, "pack=kit&cor1=azul&cor2=preto");
    await abrirResumo(page);
    // Resumo novo (49f7d26): o kit aparece como dois produtos ("1ª unidade · Azul", "2ª unidade · Preto"), cada um com a foto da cor.
    // O título "Kit com 2 AquaBlast" saiu do resumo; o equivalente é a lista com exatamente duas unidades.
    assert.equal(await L.summary(page).locator("[data-summary-unit]").count(), 2, "duas unidades identificadas no resumo");
    await L.expectSummaryUnit(page, 1, "azul", { kit: true });
    await L.expectSummaryUnit(page, 2, "preto", { kit: true });
    // Antes de escolher a forma (2026-09-29): Pix do kit em destaque, parcela do cartao abaixo.
    await L.waitText(L.summaryRow(page, "Produtos"), /^R\$ 269,90$/);
    await L.waitText(L.summaryRow(page, "Desconto no Pix"), /^− R\$ 30,00$/);
    await L.waitText(L.summaryTotal(page, "pix"), /^R\$ 239,90$/);
    await L.waitText(L.summaryNote(page, /sem juros no cartão/), /^ou 12x de R\$ 22,49 sem juros no cartão$/);
    await L.fillDados(page);
    await L.submitDados(page);
    await L.fillEntrega(page);
    await L.submitEntrega(page);
    assert.equal(await page.locator(".order-bump").count(), 0, "kit nao tem oferta da 2a unidade");

    // Desde o 7d1aafa o Pix abre selecionado: o cliente escolhe o cartao.
    await L.payHead(page, "card").click();
    // O aviso do modo de teste perdeu a classe .ck-card-warn (agora é o 1º parágrafo do formulário).
    await L.waitText(page.locator(".ck-cardform > p").first(), "Não use um cartão real.");
    assert.equal(await L.field(page, "cc-number").getAttribute("autocomplete"), "cc-number");
    assert.equal(await L.field(page, "cc-number").getAttribute("inputmode"), "numeric");
    assert.equal(await L.field(page, "cc-cpf").inputValue(), "");
    await L.waitText(L.summaryTotal(page, "card"), /^R\$ 269,90$/);
    await L.waitText(L.summaryNote(page, /12x de/), /^12x de R\$ 22,49 sem juros$/);
    const pagar = page.locator('.ck-cardform button[type="submit"]');
    await L.waitText(pagar, "Pagar R$ 269,90");
    await L.waitText(page.locator(".ck-card-payment-total"), /Total no cartão\s*R\$ 269,90\s*12x de R\$ 22,49 sem juros/);

    // Luhn invalido: mascara, bandeira e foco no numero.
    await cartao(page, L.CARD_BAD_LUHN);
    assert.equal(await L.field(page, "cc-exp").inputValue(), "12/30");
    assert.equal(await L.field(page, "cc-cpf").inputValue(), "529.982.247-25");
    // A bandeira perdeu a classe .ck-brand: é o <em> dentro do rótulo "Número do cartão".
    await L.waitText(page.locator(".ck-cardform label").filter({ has: L.field(page, "cc-number") }).locator("em"), /^(· )?Visa$/);
    await pagar.click();
    await erroDoCampo(page, "cc-number", "Número do cartão inválido. Confira os dígitos.");

    await cartao(page, L.CARD_OK, { validade: "0120" });
    await pagar.click();
    await erroDoCampo(page, "cc-exp", "Validade inválida ou vencida");

    await cartao(page, L.CARD_OK, { nome: "MARIA" });
    await pagar.click();
    await erroDoCampo(page, "cc-name", "nome e sobrenome");

    await cartao(page, L.CARD_OK, { cpf: "52998224724" });
    await pagar.click();
    await erroDoCampo(page, "cc-cpf", "Confira o CPF do titular do cartão.");

    // Parcelas: 12x por padrao; da para trocar.
    const inst = L.field(page, "cc-installments");
    const selText = () => inst.evaluate((s) => s.options[s.selectedIndex].text.replace(/\s+/g, " ").trim());
    assert.match(await selText(), /^12x de R\$\s22,49 sem juros$/);
    await inst.selectOption("3");
    assert.match(await selText(), /^3x de R\$\s89,97 sem juros$/);
    await L.waitText(page.locator(".ck-card-payment-total"), /Total no cartão\s*R\$ 269,90\s*3x de R\$ 89,97 sem juros/);
    await inst.selectOption("12");

    // Recusado pelo simulado: mensagem do gateway, numero e CVV limpos.
    await cartao(page, L.CARD_REFUSED);
    await pagar.click();
    await L.waitText(page.locator(".ck-cardform p.error"), /não autorizado|recusad/i, 15000);
    assert.equal(await L.field(page, "cc-csc").inputValue(), "");
    assert.equal(await L.field(page, "cc-number").inputValue(), "");
    await L.shot(page, `c2-${variant.tag}-5-cartao-recusado`);

    // Aprovado.
    await cartao(page, L.CARD_OK);
    await pagar.click();
    await page.waitForURL(/\/checkout\/pedido\//, { timeout: 20000 });
    // Tela de compra confirmada (2026-09-28): forma de pagamento, itens e frete sairam da tela.
    await L.waitText(page.locator(".oc-hero"), /Obrigado pela sua compra, \S+!/);
    await L.waitText(page.locator(".oc-summary"), /Total\s*R\$/);
    await L.waitText(page.locator(".oc-summary"), /Enviamos a confirmação para \S+@/);
    assert.equal(await page.locator(".oc-step.is-current strong").textContent(), "Compra aprovada");
    await L.waitText(page.locator(".oc-hero"), "Pagamento aprovado");
    assert.equal(await page.locator(".oc-step.is-done").count(), 2, "pedido pago comeca com 2 etapas concluidas");
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
