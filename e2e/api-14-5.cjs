/* eslint-disable @typescript-eslint/no-require-imports */
// Fase 14.5: travas das APIs (equivalente aos testes com curl), cron de recuperacao e busca do cartao.
// Alvo: dev em http://localhost:3100 + banco local + coletor SMTP local (e2e/_smtp-sink.cjs -> e2e/out/mail).
// O CRON_SECRET e lido do .env so em memoria (Authorization) e nunca impresso nem gravado.
// Variavel opcional DEV_LOG: caminho do log do `next dev` para a busca do numero do cartao.
const fs = require("fs");
const path = require("path");
const L = require("./_lib.cjs");
const { loadEnv } = require("./_env.cjs");
const { assert, withDb } = L;

const STAMP = Date.now().toString(36);
const MAIL = path.join(__dirname, "out", "mail");
const one = async (sql, args) => (await withDb((c) => c.query(sql, args))).rows[0];
const ORIGIN = { origin: L.BASE, "content-type": "application/json" };

function mailsTo(addr) {
  if (!fs.existsSync(MAIL)) return [];
  return fs.readdirSync(MAIL).filter((f) => f.endsWith(".eml")).map((f) => fs.readFileSync(path.join(MAIL, f), "utf8")).filter((t) => new RegExp(`^To: .*${addr.replace(/[.+]/g, "\\$&")}`, "mi").test(t));
}

function cronHeaders() {
  const secret = process.env.CRON_SECRET || loadEnv().CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET ausente no .env");
  return { authorization: `Bearer ${secret}` };
}

async function cron() {
  const r = await fetch(`${L.BASE}/api/cron/abandoned-carts`, { headers: cronHeaders() });
  assert.equal(r.status, 200, `cron -> ${r.status}`);
  return r.json();
}

/** Carrinho novo (dados preenchidos, parado na entrega) com e-mail proprio. */
async function novoCarrinho(email) {
  const { browser, page } = await L.open({ width: 412, height: 915, mobile: true });
  try {
    await L.goCheckout(page);
    await L.fillDados(page, { ...L.cliente, email });
    await L.submitDados(page);
    await page.waitForTimeout(800);
    return await L.cartTokenOf(page);
  } finally {
    await browser.close();
  }
}

const tests = [];
const t = (id, title, fn) => tests.push([id, title, fn]);

t("5.1", "POST /pay sem Origin -> 403", async () => {
  const r = await fetch(`${L.BASE}/api/checkout/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(r.status, 403);
  const r2 = await fetch(`${L.BASE}/api/checkout/pay`, { method: "POST", headers: { ...ORIGIN, origin: "https://site-estranho.example" }, body: "{}" });
  assert.equal(r2.status, 403);
  return "sem Origin 403; Origin de outro site 403";
});

t("5.2", "POST /pay: 11a chamada do mesmo IP -> 429", async () => {
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
  const codes = [];
  for (let i = 0; i < 11; i++) {
    const r = await fetch(`${L.BASE}/api/checkout/pay`, { method: "POST", headers: { ...ORIGIN, "x-real-ip": ip }, body: "{}" });
    codes.push(r.status);
    if (i === 10) assert.ok(r.headers.get("retry-after"), "sem Retry-After");
  }
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(400));
  assert.equal(codes[10], 429);
  await withDb((c) => c.query("delete from rate_limits where key = $1", [`ck:pay:ip:${ip}`]));
  return "10x 400 (corpo invalido) e 11a 429 com Retry-After";
});

t("5.3", "Postback com token errado -> 404", async () => {
  const codes = [];
  for (const p of ["ironpay/token-errado", "mercadopago/token-errado", "fastpay/token-errado", "simulado/sem-token", "inexistente/x"]) {
    const r = await fetch(`${L.BASE}/api/webhooks/gateway/${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "tx_teste", status: "paid" }) });
    codes.push(r.status);
  }
  const z = await fetch(`${L.BASE}/api/webhooks/checkout/token-errado-${STAMP}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "paid" }) });
  codes.push(z.status);
  assert.deepEqual(codes, [404, 404, 404, 404, 404, 404]);
  return "gateway (ironpay, mercadopago, fastpay, simulado, inexistente) e Zedy: todos 404";
});

t("5.4", "Confirmacao repetida: nada muda e so 1 Purchase", async () => {
  const o = await one("select o.order_number, o.public_token, o.payment_status, c.token cart_token from orders o join checkout_carts c on c.id = o.cart_id where o.checkout_provider = 'proprio' and o.payment_status = 'paid' and o.payment_method = 'pix' order by o.paid_at desc limit 1");
  assert.ok(o, "sem pedido pago para testar (rode 08-15 antes)");
  const r = await fetch(`${L.BASE}/api/checkout/simular-pagamento`, { method: "POST", headers: ORIGIN, body: JSON.stringify({ publicToken: o.public_token }) });
  assert.equal(r.status, 409, `simular de novo -> ${r.status}`);
  const p = await fetch(`${L.BASE}/api/checkout/pay`, { method: "POST", headers: ORIGIN, body: JSON.stringify({ cartToken: o.cart_token, method: "pix", installments: 1, bump: false }) });
  assert.equal(p.status, 409, `pagar carrinho convertido -> ${p.status}`);
  const n = await one("select count(*)::int n from conversion_events where event_id = $1", [`pur-${o.order_number}`]);
  assert.ok(n.n <= 2, `Purchase repetido: ${n.n}`); // 1 por destino ligado (so meta no setup)
  const byDest = await one("select count(*)::int n from conversion_events where event_id = $1 and destination = 'meta'", [`pur-${o.order_number}`]);
  assert.equal(byDest.n, 1);
  return `pedido ${o.order_number}: simular 409, /pay 409, 1 Purchase (meta)`;
});

t("5.5", "Cron sem Authorization ou com token errado -> 401", async () => {
  const a = await fetch(`${L.BASE}/api/cron/abandoned-carts`);
  const b = await fetch(`${L.BASE}/api/cron/abandoned-carts`, { headers: { authorization: "Bearer errado" } });
  assert.deepEqual([a.status, b.status], [401, 401]);
  return "401 e 401";
});

const cart1 = { email: `recupera.${STAMP}@teste.test` };
const cart2 = { email: `descadastro.${STAMP}@teste.test` };

t("5.6", "Cron: carrinho de 31 min recebe 1 e-mail, sem reenvio; descadastrado nao recebe", async () => {
  cart1.token = await novoCarrinho(cart1.email);
  cart2.token = await novoCarrinho(cart2.email);
  assert.ok(cart1.token && cart2.token, "carrinhos nao criados");
  const un = await fetch(`${L.BASE}/checkout/descadastrar/${cart2.token}`);
  assert.equal(un.status, 200);
  const c2 = await one("select unsubscribed_at from checkout_carts where token = $1", [cart2.token]);
  assert.ok(c2.unsubscribed_at, "descadastro nao gravou");
  await withDb((c) => c.query("update checkout_carts set last_activity_at = now() - interval '31 minutes' where token = any($1)", [[cart1.token, cart2.token]]));
  const r1 = await cron();
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(mailsTo(cart1.email).length, 1, "carrinho 1 deveria ter 1 e-mail");
  assert.equal(mailsTo(cart2.email).length, 0, "descadastrado recebeu e-mail");
  const row = await one("select status, recovery_email_count from checkout_carts where token = $1", [cart1.token]);
  assert.deepEqual([row.status, row.recovery_email_count], ["abandoned", 1]);
  const html = mailsTo(cart1.email)[0];
  assert.ok(html.includes(`/checkout/pedido/${cart1.token}`) || html.replace(/=\r?\n/g, "").includes(`/checkout/pedido/${cart1.token}`), "link de retomada ausente");
  await cron();
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(mailsTo(cart1.email).length, 1, "reenvio indevido");
  return `1a rodada carts=${JSON.stringify(r1.carts)}; 1 e-mail com link de retomada; 2a rodada sem reenvio; descadastrado 0`;
});

t("5.7", "Cron: cartao recusado sem nova tentativa -> e-mail payment_refused", async () => {
  const email = `recusado.${STAMP}@teste.test`;
  const { browser, page } = await L.open({ width: 1440, height: 900 });
  let token;
  try {
    await L.goCheckout(page, "pack=kit&cor1=azul&cor2=preto");
    await L.fillDados(page, { ...L.cliente, email });
    await L.submitDados(page);
    await L.fillEntrega(page);
    await L.submitEntrega(page);
    await page.locator(".pay-head", { hasText: "Cartão de crédito" }).click();
    await L.field(page, "cc-number").fill(L.CARD_REFUSED);
    await L.field(page, "cc-exp").fill("1230");
    await L.field(page, "cc-csc").fill("123");
    await L.field(page, "cc-name").fill("MARIA T SILVA");
    await L.field(page, "cc-cpf").fill(L.cliente.cpf);
    await page.locator('.ck-cardform button[type="submit"]').click();
    await L.waitText(page.locator(".ck-cardform p.error"), /não autorizado/i, 15000);
    token = await L.cartTokenOf(page);
  } finally {
    await browser.close();
  }
  const o = await one("select o.id, o.payment_status from orders o join checkout_carts c on c.id = o.cart_id where c.token = $1", [token]);
  assert.equal(o.payment_status, "pending", "recusa nao deveria cancelar o pedido");
  const a = await one("select status, card_brand, card_last4 from payment_attempts where order_id = $1 order by created_at desc limit 1", [o.id]);
  assert.deepEqual([a.status, a.card_brand, a.card_last4], ["refused", "Visa", "0002"]);
  await withDb((c) => c.query("update payment_attempts set created_at = now() - interval '31 minutes' where order_id = $1", [o.id]));
  const r = await cron();
  await new Promise((ok) => setTimeout(ok, 1500));
  const mails = mailsTo(email);
  assert.ok(mails.some((m) => /Subject: .*N=C3=A3o_conseguimos_aprovar|Não conseguimos aprovar/i.test(m)), `sem e-mail de recusa (${mails.length} e-mails)`);
  return `followUps=${JSON.stringify(r.followUps)}; e-mail de pagamento recusado no coletor`;
});

t("5.9", "Cron: Pix vencido ha 30+ min -> e-mail pix_expired (so 1 vez)", async () => {
  const o = await one("select id, order_number from orders where checkout_provider = 'proprio' and payment_status = 'pending' and payment_method = 'pix' and pix_expires_at is not null and not exists (select 1 from email_log e where e.order_id = orders.id and e.template_key = 'pix_expired') order by created_at desc limit 1");
  assert.ok(o, "sem pedido Pix pendente (rode 06-07 antes)");
  await withDb((c) => c.query("update orders set pix_expires_at = now() - interval '31 minutes' where id = $1", [o.id]));
  const venceu = () => fs.readdirSync(MAIL).map((f) => fs.readFileSync(path.join(MAIL, f), "utf8").replace(/=\r?\n/g, "")).filter((m) => m.includes(o.order_number) && /venceu/.test(m)).length;
  await cron();
  await new Promise((ok) => setTimeout(ok, 1500));
  const n1 = await one("select count(*)::int n from email_log where order_id = $1 and template_key = 'pix_expired'", [o.id]);
  assert.equal(n1.n, 1, "email_log sem pix_expired");
  await cron();
  await new Promise((ok) => setTimeout(ok, 1500));
  const n2 = await one("select count(*)::int n from email_log where order_id = $1 and template_key = 'pix_expired'", [o.id]);
  assert.equal(n2.n, 1, "pix_expired reenviado");
  return `pedido ${o.order_number}: 1 e-mail pix_expired (email_log), sem reenvio; no coletor: ${venceu()}`;
});

t("5.8", "Numero do cartao nao aparece no banco, e-mails nem log", async () => {
  const cards = [L.CARD_OK, L.CARD_REFUSED, L.CARD_BAD_LUHN];
  const hits = [];
  await withDb(async (c) => {
    const tables = (await c.query("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")).rows.map((r) => r.table_name);
    for (const tb of tables) {
      const n = await c.query(`select count(*)::int n from "${tb}" t where ${cards.map((_, i) => `t::text like $${i + 1}`).join(" or ")}`, cards.map((x) => `%${x}%`));
      if (n.rows[0].n) hits.push(`${tb}: ${n.rows[0].n}`);
    }
    // CVV de teste junto de "cvv" em qualquer JSON
    for (const tb of tables) {
      const n = await c.query(`select count(*)::int n from "${tb}" t where t::text ~* '"(cvv|cardNumber|number)"\\s*:\\s*"?\\d{3,}'`);
      if (n.rows[0].n) hits.push(`${tb} (campo de cartao): ${n.rows[0].n}`);
    }
  });
  const files = [];
  if (fs.existsSync(MAIL)) for (const f of fs.readdirSync(MAIL)) files.push(path.join(MAIL, f));
  if (process.env.DEV_LOG && fs.existsSync(process.env.DEV_LOG)) files.push(process.env.DEV_LOG);
  for (const f of files) {
    const txt = fs.readFileSync(f, "utf8");
    if (cards.some((x) => txt.includes(x))) hits.push(path.basename(f));
  }
  assert.deepEqual(hits, [], `cartao encontrado em: ${hits.join(", ")}`);
  return `banco (todas as tabelas), ${files.length} arquivos (e-mails${process.env.DEV_LOG ? " + log do dev" : ""}): nada`;
});

if (require.main === module) {
  (async () => {
    const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
    for (const [id, title, fn] of tests) {
      if (only && !only.includes(id)) continue;
      await L.clearRateLimits();
      await L.scenario(`api-${id}`, title, fn);
    }
  })();
}
