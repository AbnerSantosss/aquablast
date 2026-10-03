/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 16 (2026-09-28): cupom de teste do Pix (`checkout.testCoupon`, `/checkout?cupom=`).
// Liga o cupom no banco de dev, confere tela, valor gravado no pedido e na tentativa, e os casos que NAO podem dar desconto.
const L = require("./_lib.cjs");
const { assert, withDb } = L;

const CODE = "E2ETESTE";
const one = (sql, args) => withDb((c) => c.query(sql, args)).then((r) => r.rows[0]);
const priceDetails = (page) => page.locator(".order-summary .price-details");

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
        // Cartao ignora o cupom.
        await L.waitText(page.locator(".order-summary .total"), /total R\$ 179,90/);
        assert.equal(await priceDetails(page).getByText("Desconto do cupom no Pix").count(), 0, "cartao nao pode mostrar cupom");
        await L.choosePix(page);
        await L.waitText(page.locator(".order-summary .total b"), "R$ 5,00");
        await L.waitText(priceDetails(page), /Desconto do cupom no Pix\s*− R\$ 154,90/);
        await L.waitText(page.locator(".selected-product"), /R\$ 159,90/);
        await L.shot(page, "c16-cupom-pix");
        await L.btn(page, "FINALIZAR COMPRA").click();
        await L.field(page, "pix-code").waitFor({ timeout: 15000 });
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
        await page.locator(".bump-choice").click();
        await L.waitText(page.locator(".bump-choice"), "ADICIONADO AO PEDIDO");
        await page.locator('input[name="bump-color"][value="azul"]').check();
        await L.waitText(page.locator(".order-summary .total b"), "R$ 5,00");
        await L.waitText(priceDetails(page), /Subtotal\s*R\$ 249,90/);
        await L.waitText(priceDetails(page), /Desconto do cupom no Pix\s*− R\$ 244,90/);
        await L.shot(page, "c16-cupom-bump");
      }, `pack=unit&cor=azul&cupom=${CODE}`),
    );

    await L.scenario("16c", "Codigo errado: Pix no preco cheio, sem linha de cupom", () =>
      withPage(async (page) => {
        await L.choosePix(page);
        await L.waitText(page.locator(".order-summary .total b"), "R$ 159,90");
        assert.equal(await priceDetails(page).getByText("Desconto do cupom no Pix").count(), 0);
      }, "pack=unit&cor=azul&cupom=ERRADO123"),
    );

    await L.scenario("16e", "Campo de cupom na tela (2026-09-29): codigo errado avisa, certo aplica, remover volta ao preco cheio", () =>
      withPage(async (page) => {
        await L.choosePix(page);
        await page.locator(".ck-coupon-trigger").click();
        await page.locator("#checkout-coupon").fill("ERRADO123");
        await page.locator(".ck-coupon-modal button[type=submit]").click();
        await L.waitText(page.locator("#coupon-feedback"), "Este cupom não está disponível para esta compra.");
        await page.locator("#checkout-coupon").fill(CODE.toLowerCase());
        await page.locator(".ck-coupon-modal button[type=submit]").click();
        await L.waitText(page.locator(".order-summary .total b"), "R$ 5,00");
        await L.waitText(priceDetails(page), /Desconto do cupom no Pix\s*− R\$ 154,90/);
        await L.shot(page, "c16-cupom-campo");
        await page.locator(".ck-coupon-applied button").click();
        await L.waitText(page.locator(".order-summary .total b"), "R$ 159,90");
        assert.equal(await priceDetails(page).getByText("Desconto do cupom no Pix").count(), 0);
        return "errado avisa; certo 5,00; remover 159,90";
      }, "pack=unit&cor=azul"),
    );

    await L.scenario("16d", "Cupom desligado no painel: codigo certo nao da desconto", async () => {
      await L.setSetting("checkout.testCoupon", { enabled: false, code: CODE, pixCents: 500 });
      await withPage(async (page) => {
        await L.choosePix(page);
        await L.waitText(page.locator(".order-summary .total b"), "R$ 159,90");
        assert.equal(await priceDetails(page).getByText("Desconto do cupom no Pix").count(), 0);
      }, `pack=unit&cor=azul&cupom=${CODE}`);
    });
  } finally {
    await L.deleteSetting("checkout.testCoupon");
  }
})();
