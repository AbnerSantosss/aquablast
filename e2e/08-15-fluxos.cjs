/* eslint-disable @typescript-eslint/no-require-imports */
// Cenarios 8 a 15 da fase 14.4 (checkout proprio + banco de desenvolvimento local):
//  8  kit com 2 cores diferentes -> resumo e SKU AQB-KIT-VERMELHO-PRETO no pedido;
//  9  preco muda entre Pix (159,90) e cartao (179,90) e volta;
//  10 POST /api/checkout/pay com campo extra ("amount") -> 400 (paySchema estrito; valor so do servidor);
//  11 pedido pago via Pix simulado -> payment_status paid, checkout_provider proprio, carrinho convertido,
//     e InitiateCheckout/AddPaymentInfo/Purchase em conversion_events sem nenhuma chamada a Meta;
//  12 carrinho abandonado na entrega -> step 'entrega' no banco;
//  13 /checkout/pedido/<token do carrinho> reabre na etapa certa com o CPF so mascarado;
//  14 consentimento recusado -> sem GTM/dataLayer/pixel e eventos "skipped: sem consentimento";
//  15 checkout.mode=zedy -> /checkout redireciona para a Zedy (depois volta para proprio).
// O painel /admin exige login e nao e testado aqui. Nenhum cartao real; nenhuma compra real.
const L = require("./_lib.cjs");
const { assert, withDb } = L;

const STAMP = Date.now().toString(36);
const one = async (sql, args) => (await withDb((c) => c.query(sql, args))).rows[0];
const all = async (sql, args) => (await withDb((c) => c.query(sql, args))).rows;

async function waitDb(fn, what, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`banco: ${what} nao apareceu`);
}

async function payPixSimulado(page) {
  await L.choosePix(page); // cartao abre selecionado por padrao desde 2026-09-28
  await L.btn(page, "FINALIZAR COMPRA").click();
  await L.field(page, "pix-code").waitFor({ timeout: 15000 });
  await L.btn(page, "Simular pagamento aprovado").click();
  await page.waitForURL(/\/checkout\/pedido\//, { timeout: 15000 });
  await L.waitText(page.locator(".oc-hero"), /Obrigado pela sua compra, \S+!/);
    await L.waitText(page.locator(".oc-summary"), /Total\s*R\$/);
    await L.waitText(page.locator(".oc-summary"), /Enviamos a confirmação para \S+@/);
    assert.equal(await page.locator(".oc-step.is-current strong").textContent(), "Compra aprovada");
  return page.url().split("/").pop();
}

async function c08() {
  const { browser, page, requests, pageErrors } = await L.open({ width: 1440, height: 900 });
  try {
    await L.goCheckout(page, "pack=kit&cor1=vermelho&cor2=preto");
    await L.waitText(page.locator(".selected-product"), /Kit com 2 AquaBlast.*1 vermelho \+ 1 preto/i);
    assert.equal(await page.locator(".ck-kit-thumbs img").count(), 2, "duas fotos no kit");
    await L.fillDados(page);
    await L.submitDados(page);
    await L.fillEntrega(page);
    await L.submitEntrega(page);
    await L.shot(page, "c8-kit-vermelho-preto");
    const pub = await payPixSimulado(page);
    const o = await one("select items, amount_total, checkout_provider from orders where public_token = $1", [pub]);
    assert.ok(o, "pedido nao encontrado");
    assert.deepEqual(o.items.map((i) => i.sku), ["AQB-KIT-VERMELHO-PRETO"]);
    assert.equal(Number(o.amount_total), 249.9);
    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, []);
    return `SKU ${o.items[0].sku}, total ${o.amount_total}`;
  } finally {
    await browser.close();
  }
}

async function c09() {
  const { browser, page, pageErrors } = await L.open({ width: 412, height: 915, mobile: true });
  try {
    await L.toPayment(page);
    // Desde 2026-09-28 o cartao abre selecionado e a parcela fica em destaque; no Pix o destaque vira o total a vista.
    const total = page.locator(".order-summary .total");
    const alt = page.locator(".order-summary .total-alt");
    await L.waitText(total, /12x de R\$ 14,99 ?sem juros no cartão · total R\$ 179,90/);
    await L.waitText(alt, /ou R$ 159,90 à vista no Pix ?R$ 20,00 de desconto/);
    await L.choosePix(page);
    await L.waitText(total, /À vista no Pix[\s\S]*R\$ 159,90/);
    await L.waitText(alt, /ou 12x de R\$ 14,99 sem juros no cartão/);
    await L.payHead(page, "card").click();
    await L.waitText(total, /12x de R\$ 14,99 ?sem juros no cartão · total R\$ 179,90/);
    await L.choosePix(page);
    await L.waitText(total.locator("b"), "R$ 159,90");
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
}

async function c10() {
  const { browser, page } = await L.open({ width: 1440, height: 900 });
  try {
    await L.toPayment(page);
    const token = await L.cartTokenOf(page);
    assert.ok(token, "sem token do carrinho");
    const before = await one("select count(*)::int n from orders o join checkout_carts c on c.id = o.cart_id where c.token = $1", [token]);
    const r = await page.evaluate(async (t) => {
      const res = await fetch("/api/checkout/pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cartToken: t, method: "pix", installments: 1, bump: false, amount: 1 }) });
      return { status: res.status, body: await res.json() };
    }, token);
    assert.equal(r.status, 400, `esperado 400, veio ${r.status}`);
    assert.equal(r.body.ok, false);
    const after = await one("select count(*)::int n from orders o join checkout_carts c on c.id = o.cart_id where c.token = $1", [token]);
    assert.equal(after.n, before.n, "nao deveria criar pedido");
    return `400 "${String(r.body.error || r.body.message).slice(0, 80)}"`;
  } finally {
    await browser.close();
  }
}

async function c11() {
  const { browser, page, requests, pageErrors } = await L.open({ width: 1440, height: 900, consent: "accepted" });
  try {
    await L.toPayment(page);
    const token = await L.cartTokenOf(page);
    const pub = await payPixSimulado(page);
    const o = await one("select id, order_number, payment_status, checkout_provider, payment_method, tracking_consent, paid_at from orders where public_token = $1", [pub]);
    assert.equal(o.payment_status, "paid");
    assert.equal(o.checkout_provider, "proprio");
    assert.equal(o.payment_method, "pix");
    assert.ok(o.paid_at, "paid_at vazio");
    assert.equal(o.tracking_consent, true);
    const cart = await one("select id, status, order_id from checkout_carts where token = $1", [token]);
    assert.equal(cart.status, "converted");
    assert.equal(cart.order_id, o.id);
    // InitiateCheckout usa o id da visita desde 490feab (2026-09-30): ic-<visit>, nao ic-<token>.
    const visit = await page.evaluate(() => sessionStorage.getItem("aqb-ck-visit"));
    const ids = [`ic-${visit}`, `api-${token}`, `pur-${o.order_number}`];
    const evs = await waitDb(async () => {
      const rows = await all("select event_name, event_id, status, detail from conversion_events where event_id = any($1) and destination = 'meta'", [ids]);
      return rows.length === 3 ? rows : null;
    }, "3 eventos (IC, API, Purchase)");
    const names = evs.map((e) => e.event_name).sort();
    assert.deepEqual(names, ["AddPaymentInfo", "InitiateCheckout", "Purchase"]);
    // Meta ligada sem Pixel ID (setup dos testes): o envio para antes de qualquer fetch.
    for (const e of evs) assert.match(`${e.status} ${e.detail}`, /^error Meta: Pixel ID vazio/, `${e.event_name}: ${e.status} ${e.detail}`);
    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, []);
    return `pedido ${o.order_number} pago; eventos ${names.join(", ")} gravados (erro "Pixel ID vazio", sem rede)`;
  } finally {
    await browser.close();
  }
}

const abandoned = { email: `carrinho.${STAMP}@teste.test`, token: null };

async function c12() {
  const { browser, page } = await L.open({ width: 412, height: 915, mobile: true });
  try {
    await L.goCheckout(page);
    await L.fillDados(page, { ...L.cliente, email: abandoned.email });
    await L.submitDados(page);
    await L.field(page, "cep").fill(L.endereco.cep);
    await page.waitForFunction(() => document.querySelector(".cep-city")?.textContent?.includes("São Paulo/SP"), null, { timeout: 10000 });
    abandoned.token = await L.cartTokenOf(page);
  } finally {
    await browser.close(); // fecha sem terminar = abandona
  }
  const cart = await waitDb(() => one("select status, step, customer_email, customer_document_enc, order_id, consent from checkout_carts where token = $1 and step = 'entrega'", [abandoned.token]), "carrinho na etapa entrega");
  assert.equal(cart.status, "open");
  assert.equal(cart.customer_email, abandoned.email);
  assert.equal(cart.order_id, null);
  assert.equal(cart.consent, false);
  assert.ok(cart.customer_document_enc && !cart.customer_document_enc.includes("52998224725"), "CPF deveria estar cifrado");
  return `status open, step entrega, CPF cifrado`;
}

async function c13() {
  assert.ok(abandoned.token, "depende do cenario 12");
  const { browser, page, pageErrors } = await L.open({ width: 1440, height: 900 });
  try {
    const res = await page.goto(`${L.BASE}/checkout/pedido/${abandoned.token}`, { waitUntil: "networkidle" });
    assert.equal(res.status(), 200);
    await L.waitText(page.locator(".ck-step[aria-current=step]"), "Entrega");
    await L.waitText(page.locator(".ck-done").nth(0), abandoned.email);
    const html = await page.content();
    assert.ok(!html.includes("52998224725") && !html.includes("529.982.247-25"), "CPF inteiro no HTML");
    await page.getByRole("button", { name: "Editar seus dados" }).click();
    assert.equal(await L.field(page, "cpf").inputValue(), "");
    assert.equal(await L.field(page, "cpf").getAttribute("placeholder"), "***.***.247-25");
    await L.shot(page, "c13-retomar-carrinho");
    const nf = await page.goto(`${L.BASE}/checkout/pedido/token-que-nao-existe-${STAMP}`);
    assert.equal(nf.status(), 404);
    assert.deepEqual(pageErrors, []);
    return "abre em Entrega; CPF ***.***.247-25; token invalido 404";
  } finally {
    await browser.close();
  }
}

async function c14() {
  const { browser, page, requests, pageErrors } = await L.open({ width: 412, height: 915, mobile: true, consent: null });
  try {
    await L.goCheckout(page);
    const banner = page.locator(".ck-consent");
    await banner.waitFor({ timeout: 5000 });
    await L.shot(page, "c14-banner-consentimento", false);
    await banner.getByRole("button", { name: "Só o essencial" }).click();
    await banner.waitFor({ state: "detached" });
    await L.fillDados(page);
    await L.submitDados(page);
    await L.fillEntrega(page);
    await L.submitEntrega(page);
    const token = await L.cartTokenOf(page);
    const pub = await payPixSimulado(page);
    const dom = await page.evaluate(() => ({
      gtm: document.querySelectorAll('script[src*="googletagmanager"], script[src*="facebook"], iframe[src*="googletagmanager"]').length,
      dataLayer: typeof window.dataLayer,
      fbq: typeof window.fbq,
      gtag: typeof window.gtag,
      cookies: document.cookie,
    }));
    assert.deepEqual({ gtm: dom.gtm, dataLayer: dom.dataLayer, fbq: dom.fbq, gtag: dom.gtag }, { gtm: 0, dataLayer: "undefined", fbq: "undefined", gtag: "undefined" });
    assert.ok(!/_fbp|_ga/.test(dom.cookies), "cookie de anuncio criado sem consentimento");
    const o = await one("select order_number, tracking_consent, fbp, fbc, ga_client_id from orders where public_token = $1", [pub]);
    assert.equal(o.tracking_consent, false);
    assert.deepEqual([o.fbp, o.fbc, o.ga_client_id], [null, null, null]);
    // InitiateCheckout usa o id da visita desde 490feab (2026-09-30): ic-<visit>, nao ic-<token>.
    const visit = await page.evaluate(() => sessionStorage.getItem("aqb-ck-visit"));
    const ids = [`ic-${visit}`, `api-${token}`, `pur-${o.order_number}`];
    const evs = await waitDb(async () => {
      const rows = await all("select event_name, status, detail from conversion_events where event_id = any($1)", [ids]);
      return rows.length === 3 ? rows : null;
    }, "3 eventos skipped");
    for (const e of evs) assert.equal(`${e.status}|${e.detail}`, "skipped|sem consentimento", e.event_name);
    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, []);
    return "3 eventos skipped 'sem consentimento'; sem GTM/dataLayer/fbq/gtag";
  } finally {
    await browser.close();
  }
}

async function c15() {
  await L.setSetting("checkout.mode", "zedy");
  try {
    // O valor das configuracoes pode ficar em cache por alguns segundos no servidor.
    let res;
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      res = await fetch(`${L.BASE}/checkout?pack=kit&cor1=azul&cor2=preto`, { redirect: "manual" });
      if (res.status >= 300 && res.status < 400) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.ok(res.status === 307 || res.status === 308, `esperado redirect, veio ${res.status}`);
    const loc = res.headers.get("location") || "";
    const host = new URL(loc, L.BASE).hostname;
    assert.ok(!["localhost", "127.0.0.1"].includes(host), `redirect para ${host}`);
    return `${res.status} para ${host}`;
  } finally {
    await L.setSetting("checkout.mode", "proprio");
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      const r = await fetch(`${L.BASE}/checkout?pack=unit&cor=azul`, { redirect: "manual" });
      if (r.status === 200) break;
      await new Promise((ok) => setTimeout(ok, 1000));
    }
  }
}

module.exports = { c08, c09, c10, c11, c12, c13, c14, c15, abandoned };

if (require.main === module) {
  (async () => {
    const list = [
      ["08", "Kit 2 cores (vermelho+preto) -> SKU no pedido", c08],
      ["09", "Preco Pix 159,90 <-> cartao 179,90", c09],
      ["10", "POST /pay com campo extra amount -> 400", c10],
      ["11", "Pedido pago via Pix simulado + eventos de conversao", c11],
      ["12", "Carrinho abandonado na entrega (banco)", c12],
      ["13", "Retomar carrinho por /checkout/pedido/<token>", c13],
      ["14", "Consentimento recusado: sem rastreador e eventos skipped", c14],
      ["15", "checkout.mode=zedy redireciona para a Zedy", c15],
    ];
    const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
    for (const [id, title, fn] of list) {
      if (only && !only.includes(id)) continue;
      await L.clearRateLimits();
      await L.scenario(id, title, fn);
    }
    if (abandoned.token) process.stdout.write(`carrinho abandonado: ${abandoned.email}\n`);
  })();
}
