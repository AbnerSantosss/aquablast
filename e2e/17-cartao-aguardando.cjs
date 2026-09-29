/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 17 (2026-09-28): cartao "aguardando gateway" (`gateway.card` = desligado + `checkout.cardComingSoon`).
// O dono quer o cartao com as parcelas visivel enquanto a IronPay nao libera cartao; o pagamento fica so no Pix.
const L = require("./_lib.cjs");
const { assert } = L;

async function withPage(fn, query = "pack=unit&cor=azul") {
  const { browser, page, requests, pageErrors } = await L.open({ width: 1440, height: 900 });
  try {
    const out = await fn(page, query);
    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, [], "erro de JavaScript na pagina");
    return out;
  } finally {
    await browser.close();
  }
}

(async () => {
  await L.clearRateLimits();
  await L.setSetting("gateway.card", "desligado");
  try {
    await L.scenario("17a", "Cartao aguardando: parcela no resumo, selo e rodape; etapa 3 abre no Pix; cartao avisa e leva ao Pix", () =>
      withPage(async (page, query) => {
        await L.setSetting("checkout.cardComingSoon", true);
        await L.goCheckout(page, query);
        await L.waitText(page.locator(".order-summary .total-alt"), /12x de R\$ 14,16/);
        assert.equal(await page.locator(".trust-seals .ck-trust-payments span", { hasText: "Cartão em até 12x" }).count(), 1, "selo do cartao");
        await L.waitText(page.locator("footer.ck-footer .pay-methods"), /Cartão em até 12x/);
        await L.fillDados(page);
        await L.submitDados(page);
        await L.fillEntrega(page);
        await L.submitEntrega(page);
        // Etapa 3 abre no Pix (unica forma que cobra); o cartao aparece com a parcela no cabecalho.
        await page.locator('.pay-item.is-open input[value="pix"]').waitFor({ timeout: 10000 });
        await L.waitText(L.payHead(page, "card"), /12x de R\$ 14,16 sem juros/);
        await L.payHead(page, "card").click();
        await L.waitText(page.locator(".ck-card-pending"), /em ativação/);
        assert.equal(await page.locator("input[name=cc-number]").count(), 0, "nao pode pedir numero de cartao sem gateway");
        await L.shot(page, "c17-cartao-aguardando");
        await page.locator(".ck-card-pending button").click();
        await page.locator('.pay-item.is-open input[value="pix"]').waitFor({ timeout: 10000 });
        await L.waitText(page.locator(".order-summary .total b"), "R$ 159,90");
        return "cartao visivel com 12x; pagamento levado ao Pix";
      }),
    );

    await L.scenario("17b", "Opcao desligada no painel: sem cartao, so Pix", () =>
      withPage(async (page, query) => {
        await L.setSetting("checkout.cardComingSoon", false);
        await L.toPayment(page, query);
        await page.locator('.pay-item.is-open input[value="pix"]').waitFor({ timeout: 10000 });
        assert.equal(await page.locator('.pay-item input[value="card"]').count(), 0, "cartao nao pode aparecer");
        assert.equal(await page.locator(".trust-seals .ck-trust-payments span", { hasText: "Cartão" }).count(), 0, "selo do cartao");
      }),
    );

    await L.scenario("17c", "API: pagar com cartao sem gateway continua recusado", async () => {
      await L.setSetting("checkout.cardComingSoon", true);
      const r = await fetch(`${L.BASE}/api/checkout/pay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cartToken: "x".repeat(32), method: "card", bump: false, installments: 12 }),
      });
      assert.ok(r.status >= 400, `status ${r.status}`);
      const cfg = await (await fetch(`${L.BASE}/api/checkout/config`)).json();
      assert.equal(cfg.card.available, false);
      assert.equal(cfg.card.comingSoon, true);
      assert.deepEqual(cfg.methods, ["pix", "card"]);
      return `pay -> ${r.status}; config comingSoon=true`;
    });
  } finally {
    await L.setSetting("gateway.card", "simulado");
    await L.deleteSetting("checkout.cardComingSoon");
  }
})();
