/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 29 (2026-10-11): frete gratis e o padrao; o Frete FULL e opcao paga, escolhida na etapa de entrega.
//  - antes da entrega, nenhuma parte do checkout mostra "Frete FULL" nem o preco dele;
//  - na etapa 2 ha duas opcoes (gratis marcada); escolher o FULL soma R$ 9,99 e grava no carrinho;
//  - o pedido pago guarda o frete escolhido e o total cobrado bate com o servidor;
//  - um corpo de pagamento nao consegue trocar o frete (o servidor le o do carrinho).
const L = require("./_lib.cjs");
const { assert, withDb } = L;

const one = async (sql, args) => (await withDb((c) => c.query(sql, args))).rows[0];

async function waitDb(fn, what, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`banco: ${what} nao apareceu`);
}

async function run() {
  const { browser, page, requests, pageErrors } = await L.open({ width: 1440, height: 900 });
  try {
    await L.goCheckout(page, "pack=unit&cor=azul");
    // Etapa 1: o FULL e o preco dele nao aparecem em lugar nenhum.
    const etapa1 = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    assert.ok(!/frete full/i.test(etapa1), "etapa 1 nao deveria citar o Frete FULL");
    assert.ok(!/9,99/.test(etapa1), "etapa 1 nao deveria mostrar o preco do Frete FULL");
    await L.waitText(page.locator(".ship-bar"), /Frete grátis/);
    assert.equal(await L.summaryRow(page, "Frete").count(), 0, "linha do frete so entra depois da entrega");
    await L.waitText(L.summaryTotal(page, "pix"), /^R\$ 149,71$/);

    await L.fillDados(page);
    await L.submitDados(page);
    await L.fillEntrega(page);

    // Etapa 2: duas opcoes, gratis marcada.
    const opts = page.locator(".ship-opt");
    assert.equal(await opts.count(), 2, "duas opcoes de frete");
    await L.waitText(page.locator(".ship-opt.is-selected"), /Frete grátis.*Grátis/);
    await L.waitText(opts.nth(1), /Frete FULL.*R\$ 9,99/);
    assert.ok(await page.locator('input[name="ship-option"][value="free"]').isChecked(), "frete gratis deveria vir marcado");

    // Escolher o FULL: total sobe 9,99 e o carrinho guarda a escolha.
    await page.locator('input[name="ship-option"][value="full"]').check();
    await L.waitText(page.locator(".ship-opt.is-selected"), /Frete FULL.*R\$ 9,99/);
    await L.waitText(L.summaryRow(page, "Frete FULL"), /^R\$ 9,99$/);
    await L.waitText(L.summaryTotal(page, "pix"), /^R\$ 159,70$/);
    const token = await L.cartTokenOf(page);
    assert.ok(token, "carrinho deveria existir");
    await waitDb(async () => (await one("select shipping_method from checkout_carts where token = $1", [token]))?.shipping_method === "full", "frete FULL no carrinho");
    await L.shot(page, "c29-entrega-full");

    // Voltar para o gratis e de novo para o FULL: o total acompanha.
    await page.locator('input[name="ship-option"][value="free"]').check();
    await L.waitText(L.summaryTotal(page, "pix"), /^R\$ 149,71$/);
    assert.equal(await L.summaryRow(page, "Frete FULL").count(), 0, "sem FULL a linha some");
    await page.locator('input[name="ship-option"][value="full"]').check();
    await L.waitText(L.summaryTotal(page, "pix"), /^R\$ 159,70$/);

    await L.submitCurrentForm(page);
    await page.locator(".pay-acc").waitFor({ timeout: 10000 });
    await L.waitText(page.locator(".ck-done").nth(1), /Frete FULL · R\$ 9,99/);
    await L.payHead(page, "card").click();
    await L.field(page, "cc-number").waitFor({ timeout: 10000 });
    await L.waitText(L.summaryTotal(page, "card"), /^R\$ 189,70$/);
    await L.waitText(L.summaryNote(page, /12x de/), /^12x de R\$ 15,81 sem juros$/);
    await L.choosePix(page);
    await L.waitText(L.summaryTotal(page, "pix"), /^R\$ 159,70$/);

    // Corpo de pagamento com frete forjado: paySchema e estrito e recusa o campo.
    const forged = await page.evaluate(async (t) => {
      const r = await fetch("/api/checkout/pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cartToken: t, method: "pix", shipping: "free" }) });
      const j = await r.json().catch(() => ({}));
      return { status: r.status, field: j.field, error: j.error };
    }, token);
    assert.equal(forged.status, 400, `pagamento com campo de frete deveria ser recusado (veio ${forged.status})`);
    assert.match(String(forged.error), /shipping/, `recusa deveria apontar o campo de frete: ${forged.error}`);

    await L.btn(page, "Gerar Pix de R$ 159,70").click();
    await L.field(page, "pix-code").waitFor({ state: "attached", timeout: 15000 });
    await L.btn(page, "Simular pagamento aprovado").click();
    await page.waitForURL(/\/checkout\/pedido\//, { timeout: 15000 });
    await L.waitText(page.locator(".oc-hero"), /Obrigado pela sua compra, \S+!/);
    await L.waitText(page.locator(".oc-summary"), /Frete FULL\s*R\$ 9,99/);
    await L.waitText(page.locator(".oc-summary"), /Total\s*R\$ 159,70/);
    const pub = page.url().split("/").pop();
    const o = await one("select items, amount_total from orders where public_token = $1", [pub]);
    assert.ok(o, "pedido nao encontrado");
    assert.equal(Number(o.amount_total), 159.7);
    assert.equal(o.items[0].checkoutPricing.shippingMethod, "full");
    assert.equal(o.items[0].checkoutPricing.shippingCents, 999);
    await L.shot(page, "c29-pedido-full");

    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, [], "erro de JavaScript na pagina");
    return `pedido com Frete FULL, total ${o.amount_total}`;
  } finally {
    await browser.close();
  }
}

module.exports = { run };

if (require.main === module) {
  (async () => {
    await L.clearRateLimits();
    await L.scenario("29", "Frete grátis padrão e Frete FULL escolhido na entrega", run);
  })();
}
