/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 32: multiempresa (gateway para outras LPs, 2026-10-13).
//   32.1 API v1: 401 sem chave e com chave errada; GET /products 200 (so os produtos da empresa); CORS de origem
//        permitida x negada (chamada e preflight); POST /checkouts -> 201 com checkoutUrl (que abre em 200) e erros
//        de entrada; GET pedido de outra empresa -> 404.
//   32.2 /c/aquablast com 2 produtos ate a tela do Pix simulado (NAO simula pagamento).
//   32.3 empresa temporaria com tema neutro (sem marca, CNPJ nem endereco do AquaBlast) e sem gateway:
//        a etapa de pagamento diz que a loja ainda nao configurou uma forma de pagamento.
//   32.4 /checkout?pack= legado continua 200 e /c/<inexistente> 404.
// Cria direto no banco (empresas e-2e32-*, produtos, chave com SHA-256 em api_key_hash) e APAGA tudo no fim, mesmo
// falhando no meio: empresas (cascata nos produtos), carrinhos, pedidos e linhas ligadas ao e-mail de teste.
// Pre-requisito: dev na 3100 e `node e2e/_setup.cjs on`. Rodar: NODE_PATH="$(npm root -g)" node e2e/32-multiempresa.cjs
const crypto = require("node:crypto");
const L = require("./_lib.cjs");
const { assert, BASE, withDb } = L;

const RUN = Date.now().toString(36);
const SLUG_A = `e2e32-a-${RUN}`;
const SLUG_B = `e2e32-b-${RUN}`;
const SLUG_NOGW = `e2e32-nogw-${RUN}`;
const NAME_NOGW = `Loja Neutra ${RUN}`;
const ORIGIN_OK = "https://lp-externa.e2e32.test";
const ORIGIN_NO = "https://invasor.e2e32.test";
const EMAIL = `e2e32-${RUN}@teste.test`;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const newKey = () => `abk_${crypto.randomBytes(24).toString("hex")}`;
const KEY_A = newKey();
const KEY_B = newKey();

const created = { companyIds: [] };
let orderNumberAquablast = null;

async function mkCompany(c, { slug, name, key, origins }) {
  const r = await c.query(
    "insert into companies(slug, name, active, api_key_hash, api_key_prefix, allowed_origins) values ($1, $2, true, $3, $4, $5::jsonb) returning id",
    [slug, name, key ? sha256(key) : null, key ? key.slice(0, 8) : null, JSON.stringify(origins || [])],
  );
  created.companyIds.push(r.rows[0].id);
  return r.rows[0].id;
}
async function mkProduct(c, companyId, slug, name, pix, card, position) {
  await c.query(
    "insert into products(company_id, slug, name, description, price_pix_cents, price_card_cents, active, position) values ($1, $2, $3, '', $4, $5, true, $6)",
    [companyId, slug, name, pix, card, position],
  );
}

async function setup() {
  await withDb(async (c) => {
    const a = await mkCompany(c, { slug: SLUG_A, name: `Empresa A ${RUN}`, key: KEY_A, origins: [ORIGIN_OK] });
    await mkProduct(c, a, "camiseta", "Camiseta E2E", 5000, 5500, 0);
    await mkProduct(c, a, "caneca", "Caneca E2E", 3000, 3300, 1);
    await mkCompany(c, { slug: SLUG_B, name: `Empresa B ${RUN}`, key: KEY_B, origins: [] });
    const n = await mkCompany(c, { slug: SLUG_NOGW, name: NAME_NOGW, key: null, origins: [] });
    await mkProduct(c, n, "item-um", "Item Um", 4000, 4400, 0);
    await mkProduct(c, n, "item-dois", "Item Dois", 2000, 2200, 1);
    // "Sem gateway": roteia para um gateway real SEM credenciais da empresa. Credencial nunca e herdada do AquaBlast,
    // entao nao cobra. (Nao basta deixar em branco: com o global em "simulado", que nao precisa de credencial, a
    // empresa herda o roteamento "simulado" e cobraria no simulado.)
    for (const k of ["gateway.pix", "gateway.card"]) {
      await c.query(
        "insert into settings(key, value, encrypted, updated_at, updated_by) values ($1, $2::jsonb, false, now(), 'e2e') on conflict (key) do update set value = excluded.value",
        [`company:${n}:${k}`, JSON.stringify("ironpay")],
      );
    }
    await c.query("delete from rate_limits where key like 'api.v1.%'");
  });
}

/** Apaga tudo que o roteiro criou. Cada passo isolado: uma falha nao impede os demais. */
async function cleanup() {
  const report = [];
  await withDb(async (c) => {
    const step = async (label, sql, params) => {
      try {
        const r = await c.query(sql, params);
        report.push(`${label}:${r.rowCount}`);
      } catch (e) {
        report.push(`${label}:ERRO ${String(e.message).split("\n")[0]}`);
      }
    };
    const ids = created.companyIds;
    const orderIds = `(select id from orders where customer_email = $1 or company_id = any($2::uuid[]))`;
    const cartIds = `(select id from checkout_carts where customer_email = $1 or company_id = any($2::uuid[]))`;
    const p = [EMAIL, ids];
    await step("conversion_events", `delete from conversion_events where order_id in ${orderIds} or cart_id in ${cartIds}`, p);
    await step("email_log", `delete from email_log where order_id in ${orderIds}`, p);
    await step("webhook_deliveries", `delete from webhook_deliveries where order_id in ${orderIds}`, p);
    await step("payment_attempts", `delete from payment_attempts where order_id in ${orderIds}`, p);
    await step("checkout_carts", `delete from checkout_carts where customer_email = $1 or company_id = any($2::uuid[])`, p);
    await step("orders", `delete from orders where customer_email = $1 or company_id = any($2::uuid[])`, p);
    await step("company_webhook_deliveries", `delete from company_webhook_deliveries where company_id = any($1::uuid[])`, [ids]);
    await step("settings", `delete from settings where key like any($1::text[])`, [ids.map((i) => `company:${i}:%`)]);
    await step("products", `delete from products where company_id = any($1::uuid[])`, [ids]);
    await step("companies", `delete from companies where id = any($1::uuid[])`, [ids]);
    await step("rate_limits", `delete from rate_limits where key like 'api.v1.%' or key like 'ck:%'`, []);
  });
  return report.join(", ");
}

const call = (path, { key, origin, method = "GET", body, headers = {} } = {}) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });

// ---------- 32.2 (precisa rodar antes do 32.1 de pedido de outra empresa, pois gera o pedido do AquaBlast) ----------
async function pixAquablast() {
  const { browser, page, requests, pageErrors } = await L.open({ width: 1440, height: 900 });
  try {
    const res = await page.goto(`${BASE}/c/aquablast`, { waitUntil: "networkidle" });
    assert.equal(res.status(), 200, "GET /c/aquablast");
    await page.locator(".ck-flow").waitFor();
    await L.noHorizontalScroll(page);
    await L.revealSummary(page);
    // Garante 2 produtos DIFERENTES no resumo: soma o primeiro da lista "Adicionar ao pedido" se so houver 1.
    const lines = page.locator("[data-items-line]");
    if ((await lines.count()) < 2) {
      const add = page.locator("[data-items-add] button").first();
      await add.waitFor({ state: "visible", timeout: 10000 });
      await add.click();
      await page.waitForFunction(() => document.querySelectorAll("[data-items-line]").length >= 2, null, { timeout: 10000 });
    }
    assert.ok((await lines.count()) >= 2, "esperava 2 produtos no resumo");
    const slugs = await lines.evaluateAll((els) => els.map((e) => e.getAttribute("data-items-line")));
    assert.equal(new Set(slugs).size, slugs.length, "linhas repetidas no resumo");

    await L.fillDados(page, { ...L.cliente, email: EMAIL });
    await L.submitDados(page);
    await L.fillEntrega(page);
    await L.submitCurrentForm(page);
    await page.locator(".pay-acc").waitFor({ timeout: 15000 });
    await L.waitText(page.locator(".ck-testmode").first(), "Modo de teste");
    await L.choosePix(page);
    // Itens na etapa de pagamento: resumo somente leitura com as mesmas linhas.
    await L.revealSummary(page);
    assert.equal(await page.locator("[data-items-line]").count(), slugs.length, "linhas do resumo mudaram na etapa 3");

    await page.getByRole("button", { name: /^Gerar Pix de R\$/ }).click();
    const code = L.field(page, "pix-code");
    await code.waitFor({ state: "attached", timeout: 20000 });
    assert.match(await code.inputValue(), /^SIMULADO-NAO-PAGUE-sim_/);
    await L.waitText(L.pixCountdown(page), /^(10:00|09:[45]\d|\d\d:\d\d)$/);
    await L.noHorizontalScroll(page);
    await L.shot(page, "c32-aquablast-pix-gerado");
    // NAO clica em "Simular pagamento aprovado": o roteiro para na tela do Pix.
    assert.equal(page.url().includes("/checkout/pedido/"), false, "nao era para ter pago");
    assert.deepEqual(pageErrors, [], `erros de pagina: ${pageErrors.join(" | ")}`);
    L.checkNetwork(requests);

    const o = await withDb(async (c) => (await c.query("select order_number, items, company_id from orders where customer_email = $1 order by created_at desc limit 1", [EMAIL])).rows[0]);
    assert.ok(o, "pedido nao foi criado ao gerar o Pix");
    assert.ok(Array.isArray(o.items) && o.items.length >= 2, `pedido deveria ter 2 itens, tem ${o.items && o.items.length}`);
    assert.equal(o.company_id, "00000000-0000-4000-8000-000000000001");
    orderNumberAquablast = o.order_number;
    return `${slugs.join(" + ")} -> pedido ${o.order_number} com ${o.items.length} itens`;
  } finally {
    await browser.close();
  }
}

// ---------- 32.1 API v1 ----------
async function apiV1() {
  const notes = [];
  // 401 sem chave e com chave errada
  let r = await call("/api/v1/products");
  assert.equal(r.status, 401, "sem chave");
  r = await call("/api/v1/products", { key: newKey() });
  assert.equal(r.status, 401, "chave errada");
  r = await call("/api/v1/products", { key: "lixo" });
  assert.equal(r.status, 401, "chave mal formada");
  r = await call("/api/v1/checkouts", { method: "POST", body: { items: [{ productSlug: "camiseta", quantity: 1 }] } });
  assert.equal(r.status, 401, "POST sem chave");
  r = await call(`/api/v1/orders/AQB-NAO-EXISTE`);
  assert.equal(r.status, 401, "pedido sem chave");
  notes.push("401 x5");

  // GET /products 200, so os produtos da empresa A
  r = await call("/api/v1/products", { key: KEY_A });
  assert.equal(r.status, 200, "GET /products");
  assert.match(r.headers.get("cache-control") || "", /no-store/);
  const prod = await r.json();
  const list = prod.products || prod.items || prod.data;
  assert.ok(Array.isArray(list), `formato inesperado: ${JSON.stringify(prod).slice(0, 120)}`);
  const slugs = list.map((p) => p.slug).sort();
  assert.deepEqual(slugs, ["camiseta", "caneca"], "produtos de outra empresa vazaram");
  notes.push("products 200");

  // CORS: origem permitida x negada x sem Origin
  r = await call("/api/v1/products", { key: KEY_A, origin: ORIGIN_OK });
  assert.equal(r.status, 200, "origem permitida");
  assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN_OK);
  r = await call("/api/v1/products", { key: KEY_A, origin: ORIGIN_NO });
  assert.equal(r.status, 403, "origem negada");
  assert.equal(r.headers.get("access-control-allow-origin"), null, "origem negada nao pode receber ACAO");
  r = await call("/api/v1/products", { key: KEY_B, origin: ORIGIN_OK });
  assert.equal(r.status, 403, "origem da empresa A com a chave da B");
  r = await call("/api/v1/products", { method: "OPTIONS", origin: ORIGIN_OK, headers: { "Access-Control-Request-Method": "POST" } });
  assert.equal(r.status, 204, "preflight permitido");
  assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN_OK);
  r = await call("/api/v1/products", { method: "OPTIONS", origin: ORIGIN_NO, headers: { "Access-Control-Request-Method": "POST" } });
  assert.equal(r.status, 403, "preflight negado");
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  notes.push("CORS ok/negado");

  // POST /checkouts -> 201 com checkoutUrl que abre em 200
  r = await call("/api/v1/checkouts", { key: KEY_A, method: "POST", origin: ORIGIN_OK, body: { items: [{ productSlug: "camiseta", quantity: 2 }, { productSlug: "caneca", quantity: 1 }] } });
  assert.equal(r.status, 201, "POST /checkouts");
  assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN_OK);
  const made = await r.json();
  assert.ok(made.cartId, "sem cartId");
  assert.match(made.checkoutUrl, new RegExp(`/c/${SLUG_A}\\?carrinho=[A-Za-z0-9_-]{8,}$`), `checkoutUrl: ${made.checkoutUrl}`);
  const url = new URL(made.checkoutUrl);
  const page = await fetch(`${BASE}${url.pathname}${url.search}`, { redirect: "manual" });
  assert.equal(page.status, 200, "checkoutUrl nao abre");
  notes.push("POST 201 + url 200");

  // Entradas invalidas
  r = await call("/api/v1/checkouts", { key: KEY_A, method: "POST", body: { items: [{ productSlug: "nao-existe", quantity: 1 }] } });
  assert.equal(r.status, 400, "produto inexistente");
  r = await call("/api/v1/checkouts", { key: KEY_A, method: "POST", body: { items: [{ productSlug: "kit", quantity: 1 }] } });
  assert.equal(r.status, 400, "produto de outra empresa (kit do AquaBlast)");
  r = await call("/api/v1/checkouts", { key: KEY_A, method: "POST", body: { items: [] } });
  assert.equal(r.status, 400, "lista vazia");
  r = await call("/api/v1/checkouts", { key: KEY_A, method: "POST", body: { items: [{ productSlug: "camiseta", quantity: 0 }] } });
  assert.equal(r.status, 400, "quantidade 0");
  notes.push("400 x4");

  // Pedido de outra empresa -> 404 (o pedido do AquaBlast criado no 32.2, consultado com a chave da empresa A)
  assert.ok(orderNumberAquablast, "sem pedido do 32.2 para consultar");
  r = await call(`/api/v1/orders/${encodeURIComponent(orderNumberAquablast)}`, { key: KEY_A });
  assert.equal(r.status, 404, "pedido do AquaBlast visto pela empresa A");
  r = await call(`/api/v1/orders/AQB-INEXISTENTE-0`, { key: KEY_A });
  assert.equal(r.status, 404, "pedido inexistente");
  notes.push("pedido de outra empresa 404");
  return notes.join("; ");
}

// ---------- 32.3 empresa temporaria sem gateway ----------
async function semGateway() {
  const { browser, page, pageErrors } = await L.open({ width: 1440, height: 900 });
  try {
    const res = await page.goto(`${BASE}/c/${SLUG_NOGW}`, { waitUntil: "networkidle" });
    assert.equal(res.status(), 200, "GET /c/<empresa temporaria>");
    await page.locator(".ck-flow").waitFor();
    // Tema neutro: nada da identidade do AquaBlast (nome, CNPJ, endereco, rodape) na pagina inteira.
    const text = await page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(text, /aquablast/i, "texto com a marca AquaBlast");
    assert.doesNotMatch(text, /CNPJ/i, "CNPJ na pagina da empresa neutra");
    assert.doesNotMatch(text, /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/, "numero de CNPJ na pagina");
    assert.match(await page.title(), new RegExp(NAME_NOGW), "titulo sem o nome da empresa");
    await L.noHorizontalScroll(page);

    await L.fillDados(page, { ...L.cliente, email: EMAIL });
    await L.submitDados(page);
    await L.fillEntrega(page);
    await L.submitCurrentForm(page);
    await page.getByText(/ainda não configurou uma forma de pagamento/).first().waitFor({ state: "visible", timeout: 15000 });
    assert.equal(await page.locator(".pay-acc").count(), 0, "nao deveria mostrar formas de pagamento");
    assert.equal(await page.getByRole("button", { name: /^Gerar Pix/ }).count(), 0, "nao deveria oferecer gerar Pix");
    const text3 = await page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(text3, /aquablast/i, "marca AquaBlast na etapa de pagamento");
    await L.shot(page, "c32-empresa-sem-gateway");
    assert.deepEqual(pageErrors, [], `erros de pagina: ${pageErrors.join(" | ")}`);

    // O servidor tambem recusa cobrar: pay responde 503 no_gateway (credencial nunca e herdada).
    const token = await page.evaluate((slug) => {
      try { return window.localStorage.getItem(`ck-cart-token-c-${slug}`); } catch { return null; }
    }, SLUG_NOGW);
    if (token) {
      const r = await fetch(`${BASE}/api/checkout/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: BASE },
        body: JSON.stringify({ cartToken: token, method: "pix" }),
      });
      assert.ok(r.status === 503 || r.status === 400 || r.status === 409, `pay sem gateway deveria recusar, voltou ${r.status}`);
      return `mensagem exibida; pay -> ${r.status}`;
    }
    return "mensagem exibida (sem token no localStorage para testar o pay)";
  } finally {
    await browser.close();
  }
}

// ---------- 32.4 legado ----------
async function legado() {
  let r = await fetch(`${BASE}/checkout?pack=unit&cor=azul`, { redirect: "manual" });
  assert.equal(r.status, 200, "/checkout?pack=unit&cor=azul");
  r = await fetch(`${BASE}/checkout?pack=kit&cor1=azul&cor2=preto`, { redirect: "manual" });
  assert.equal(r.status, 200, "/checkout?pack=kit");
  r = await fetch(`${BASE}/c/e2e32-nao-existe-${RUN}`, { redirect: "manual" });
  assert.equal(r.status, 404, "empresa inexistente");
  r = await fetch(`${BASE}/c/ADMIN%20x`, { redirect: "manual" });
  assert.equal(r.status, 404, "slug malformado");
  return "legado 200; /c/inexistente 404";
}

(async () => {
  let ok = true;
  let cleanupReport = "";
  try {
    await L.clearRateLimits();
    await setup();
    ok = (await L.scenario("32.2", "/c/aquablast com 2 produtos ate o Pix simulado", pixAquablast)) && ok;
    ok = (await L.scenario("32.1", "API v1: chave, CORS, checkouts, pedido de outra empresa", apiV1)) && ok;
    ok = (await L.scenario("32.3", "empresa temporaria: tema neutro e sem gateway", semGateway)) && ok;
    ok = (await L.scenario("32.4", "/checkout?pack= legado e /c invalido", legado)) && ok;
  } catch (e) {
    ok = false;
    process.stdout.write(`[FALHOU] 32 preparo ${String(e && e.message ? e.message : e).split("\n")[0]}\n`);
  } finally {
    try {
      cleanupReport = await cleanup();
    } catch (e) {
      cleanupReport = `ERRO ${String(e && e.message ? e.message : e).split("\n")[0]}`;
      ok = false;
    }
    process.stdout.write(`limpeza 32: ${cleanupReport}\n`);
    if (/ERRO/.test(cleanupReport)) {
      ok = false;
      process.stdout.write(`[FALHOU] 32.limpeza ${cleanupReport}\n`);
    }
  }
  process.exitCode = ok ? 0 : 1;
})();
