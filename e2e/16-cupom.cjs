/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 16 (2026-09-28): cupom de teste do Pix (`checkout.testCoupon`, `/checkout?cupom=`).
// Liga o cupom no banco de dev, confere tela, valor gravado no pedido e na tentativa, e os casos que NAO podem dar desconto.
const L = require("./_lib.cjs");
const { assert, withDb } = L;

const CODE = "E2ETESTE";
const one = (sql, args) => withDb((c) => c.query(sql, args)).then((r) => r.rows[0]);
// Resumo novo (49f7d26): os valores ficam no <dl> de .ck-summary-details (antes ".price-details" e ".total").
const priceDetails = (page) => L.summary(page).locator("dl");
const totalPix = (page) => L.summaryTotal(page, "pix");

async function withPage(fn, query) {
  const { browser, page, requests, pageErrors } = await L.open({ width: 1440, height: 900 });
  try {
    await L.toPayment(page, query);
    const out = await fn(page);
    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, [], "erro de JavaScript na pagina");
    return out;
  } finally {
    await browser.close();
  }
}

(async () => {
  await L.clearRateLimits();
  await L.setSetting("checkout.testCoupon", { enabled: true, code: CODE, pixCents: 500 });
  try {
    await L.scenario("16a", "Cupom certo (minusculo na URL): Pix R$ 5,00, cartao sem desconto, pedido gravado com 5,00", () =>
      withPage(async (page) => {
        // Cartao ignora o cupom. Desde o 7d1aafa o Pix abre selecionado: escolhe o cartao e confere a parcela cheia (179,90 em 12x de 15,82).
        await L.payHead(page, "card").click();
        await L.waitText(L.summaryTotal(page, "card"), /^R\$ 189,89$/);
        await L.waitText(L.summaryNote(page, /12x de/), /^12x de R\$ 15,82 sem juros$/);
        assert.equal(await priceDetails(page).getByText("Desconto do cupom no Pix").count(), 0, "cartao nao pode mostrar cupom");
        await L.choosePix(page);
        await L.waitText(totalPix(page), /^R\$ 5,00$/);
        await L.waitText(priceDetails(page), /Desconto do cupom no Pix\s*− R\$ 154,89/);
        // Antes o selo dizia "Economize R$ 174,90" (159,89 + 20 - 5). Agora a mesma conta aparece aberta:
        // Produtos 179,90 − Desconto no Pix 30,00 − cupom 154,89 = 5,00.
        await L.waitText(L.summaryRow(page, "Produtos"), /^R\$ 179,90$/);
        await L.waitText(L.summaryRow(page, "Desconto no Pix"), /^− R\$ 30,00$/);
        await L.waitText(L.summaryRow(page, "Desconto do cupom no Pix"), /^− R\$ 154,89$/);
        await L.waitText(page.locator("#coupon-feedback"), "Cupom aplicado ao pagamento no Pix.");
        await L.shot(page, "c16-cupom-pix");
        await page.locator(".pix-payment-start .pix-primary").click(); // "Gerar código Pix" (a446b8c)
        await L.field(page, "pix-code").waitFor({ state: "attached", timeout: 15000 }); // campo fica dentro do <details> fechado (PixPaymentCode): existe, mas nao e visivel
        const token = await L.cartTokenOf(page);
        const o = await one(
          "select o.public_token, o.amount_total, a.amount_cents from orders o join checkout_carts c on c.id = o.cart_id join payment_attempts a on a.order_id = o.id where c.token = $1 order by a.created_at desc limit 1",
          [token],
        );
        assert.equal(Number(o.amount_total), 5, "total do pedido");
        assert.equal(Number(o.amount_cents), 500, "valor da tentativa (o que vai ao gateway)");
        await L.btn(page, "Simular pagamento aprovado").click();
        await page.waitForURL(/\/checkout\/pedido\//, { timeout: 15000 });
        await L.waitText(page.locator(".oc-summary"), /Total\s*R\$ 5,00/);
        const paid = await one("select payment_status from orders where public_token = $1", [o.public_token]);
        assert.equal(paid.payment_status, "paid");
        return "pedido 5,00 pago; tentativa 500 centavos";
      }, `pack=unit&cor=azul&cupom=${CODE.toLowerCase()}`),
    );

    await L.scenario("16b", "Cupom + 2a unidade (bump): Pix R$ 5,00, subtotal 249,90", () =>
      withPage(async (page) => {
        await L.choosePix(page);
        // Bump redesenhado (a446b8c): abrir pelo .bump-open-trigger, escolher a cor e confirmar a selecao.
        await page.locator(".bump-open-trigger").click();
        await L.waitText(page.locator(".bump-choice"), "ESCOLHA SUA SEGUNDA UNIDADE");
        await page.locator('input[name="bump-color"][value="azul"]').check();
        await L.btn(page, "Selecionar segunda unidade com desconto").click();
        await L.waitText(page.locator(".bump-choice"), "SEGUNDA UNIDADE SELECIONADA");
        await L.waitText(totalPix(page), /^R\$ 5,00$/);
        // O resumo nao tem a linha "Subtotal": o 249,90 vem de 159,89 + bump 90,00 e do desconto de 234,90 (249,90 - 5,00).
        // Antes ".bump-summary" dizia "+ 1 AquaBlast azul … R$ 90,00"; agora o valor fica na linha do bump e a cor no 2º produto.
        await L.waitText(L.summaryBump(page), /2ª unidade adicionada\s*\+ R\$ 90,00/);
        await L.expectSummaryUnit(page, 2, "azul", { kit: true });
        await L.waitText(L.summaryRow(page, "Produtos"), /^R\$ 269,90$/);
        await L.waitText(L.summaryRow(page, "Desconto no Pix"), /^− R\$ 30,00$/);
        await L.waitText(priceDetails(page), /Desconto do cupom no Pix\s*− R\$ 234,90/);
        await L.shot(page, "c16-cupom-bump");
      }, `pack=unit&cor=azul&cupom=${CODE}`),
    );

    await L.scenario("16c", "Codigo errado: Pix no preco cheio, sem linha de cupom", () =>
      withPage(async (page) => {
        await L.choosePix(page);
        await L.waitText(totalPix(page), /^R\$ 159,89$/);
        assert.equal(await priceDetails(page).getByText("Desconto do cupom no Pix").count(), 0);
      }, "pack=unit&cor=azul&cupom=ERRADO123"),
    );

    await L.scenario("16e", "Campo de cupom na tela (2026-09-29): codigo errado avisa, certo aplica, remover volta ao preco cheio", () =>
      withPage(async (page) => {
        await L.choosePix(page);
        // Desde o 49f7d26 o cupom é um campo fixo no resumo ([data-summary-coupon]); não há mais o botão que abria o modal.
        const cupom = L.summary(page).locator("[data-summary-coupon]");
        const aplicar = cupom.locator('form[aria-label="Cupom de desconto"] button[type=submit]');
        await L.waitText(aplicar, "Adicionar");
        await page.locator("#checkout-coupon").fill("ERRADO123");
        await aplicar.click();
        await L.waitText(page.locator("#coupon-feedback"), "Este cupom não está disponível para esta compra.");
        assert.equal(await page.locator("#coupon-feedback").getAttribute("role"), "alert", "erro do cupom anunciado");
        await L.waitText(totalPix(page), /^R\$ 159,89$/);
        await page.locator("#checkout-coupon").fill(CODE.toLowerCase());
        await aplicar.click();
        await L.waitText(totalPix(page), /^R\$ 5,00$/);
        await L.waitText(priceDetails(page), /Desconto do cupom no Pix\s*− R\$ 154,89/);
        await L.waitText(page.locator("#coupon-feedback"), "Cupom aplicado ao pagamento no Pix.");
        await L.shot(page, "c16-cupom-campo");
        await cupom.getByRole("button", { name: "Remover cupom", exact: true }).click();
        await L.waitText(totalPix(page), /^R\$ 159,89$/);
        assert.equal(await priceDetails(page).getByText("Desconto do cupom no Pix").count(), 0);
        return "errado avisa; certo 5,00; remover 159,89";
      }, "pack=unit&cor=azul"),
    );

    await L.scenario("16d", "Cupom desligado no painel: codigo certo nao da desconto", async () => {
      await L.setSetting("checkout.testCoupon", { enabled: false, code: CODE, pixCents: 500 });
      await withPage(async (page) => {
        await L.choosePix(page);
        await L.waitText(totalPix(page), /^R\$ 159,89$/);
        assert.equal(await priceDetails(page).getByText("Desconto do cupom no Pix").count(), 0);
      }, `pack=unit&cor=azul&cupom=${CODE}`);
    });
  } finally {
    await L.deleteSetting("checkout.testCoupon");
  }
})();
