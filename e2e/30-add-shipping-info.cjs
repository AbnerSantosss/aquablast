/* eslint-disable @typescript-eslint/no-require-imports */
// 30 - add_shipping_info (GA4 Measurement Protocol, so pelo servidor) quando a etapa de entrega fica completa.
// Pedido 2026-10-11-auditoria-conversao-checkout, agente G-medicao. Evento novo, SO do GA4: a Meta nao recebe.
// Alvo: dev em http://localhost:3100 + banco local. Pre-requisito: `node e2e/_setup.cjs on` (GA4 desligado,
// Meta ligada SEM pixelId). Rodar: NODE_PATH="$(npm root -g)" node e2e/30-add-shipping-info.cjs
//
// Como o teste nao chama o GA4 real: ele liga `ads.ga4.enabled` so durante os cenarios 30b a 30d e, ANTES de ligar,
// zera `ads.ga4.measurementId`. Sem ID de medicao o ga4-mp para antes da rede e a linha fica em conversion_events
// com status "error" e o corpo que SERIA enviado (payload). As duas linhas de settings voltam exatamente como
// estavam no fim (e, se a rodada cair no meio, na proxima: copia em e2e/out/.ga4-backup-30.json).
// Nunca le nem grava `ads.ga4.apiSecret`.
// ATENCAO: enquanto o GA4 esta ligado (cerca de 40 s), outro teste rodando AO MESMO TEMPO no mesmo banco ganha
// linhas "ga4" em conversion_events. Quem conta linhas sem filtrar o destino (08-15 cenario 14, api-14-5) pode
// falhar nessa janela. No run-all os arquivos rodam um de cada vez, entao la nao ha conflito.
//
// Cenarios:
//  30a. GA4 desligado: etapa de entrega enviada nao grava add_shipping_info em destino nenhum (a Meta segue so
//       com InitiateCheckout e AddPaymentInfo).
//  30b. Frete gratis, pelo navegador: nada sai antes de enviar a entrega; ao enviar, 1 linha ga4 asi-<token> com
//       shipping_tier "Frete grátis", valor do carrinho, 1 item, client_id do cookie _ga e nenhum dado pessoal.
//       Nenhuma linha "meta" com esse id. Nenhum script de rastreamento carregado no navegador.
//  30c. Editar o endereco e reenviar a entrega: continua 1 linha, a mesma (nao reenvia).
//  30d. Frete FULL escolhido na entrega: shipping_tier "Frete FULL" e valor com o frete.
const fs = require("fs");
const path = require("path");
const L = require("./_lib.cjs");
const { assert, withDb } = L;

const STAMP = Date.now();
const ORIGIN = { origin: L.BASE, "content-type": "application/json" };
const GA4_KEYS = ["ads.ga4.enabled", "ads.ga4.measurementId"];
const BACKUP = path.join(L.OUT, ".ga4-backup-30.json");
const EXEMPLO = path.join(L.OUT, "30-add-shipping-info-payload.json");
// client_id FICTICIO no formato do cookie _ga ("GA1.1.<a>.<b>" -> "<a>.<b>"). Nao pertence a nenhum visitante real.
const GA_CLIENT = `${String(STAMP).slice(-9)}.${Math.floor(STAMP / 1000)}`;
const GA_COOKIE = `GA1.1.${GA_CLIENT}`;

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const one = async (sql, args) => (await withDb((c) => c.query(sql, args))).rows[0];
const many = async (sql, args) => (await withDb((c) => c.query(sql, args))).rows;

async function saveRow(key) {
  const row = (await many("select value, encrypted, updated_by from settings where key = $1", [key]))[0] || null;
  if (row && row.encrypted) throw new Error(`chave cifrada inesperada: ${key}`);
  return row;
}
async function restoreRow(key, row) {
  if (!row) return withDb((c) => c.query("delete from settings where key = $1", [key]));
  return withDb((c) =>
    c.query(
      "insert into settings(key, value, encrypted, updated_at, updated_by) values ($1, $2::jsonb, $3, now(), $4) on conflict (key) do update set value = excluded.value, encrypted = excluded.encrypted, updated_by = excluded.updated_by, updated_at = now()",
      [key, JSON.stringify(row.value), row.encrypted, row.updated_by],
    ),
  );
}
/** Devolve as duas linhas do GA4. Primeiro o "ligado", depois o ID: nunca fica ligado com ID de verdade por causa do teste. */
async function restoreGa4(rows) {
  await restoreRow("ads.ga4.enabled", rows["ads.ga4.enabled"]);
  await restoreRow("ads.ga4.measurementId", rows["ads.ga4.measurementId"]);
  fs.rmSync(BACKUP, { force: true });
}
async function backupGa4() {
  // Rodada anterior caiu no meio (PC desligou): devolve o que estava antes de olhar o estado atual.
  if (fs.existsSync(BACKUP)) await restoreGa4(JSON.parse(fs.readFileSync(BACKUP, "utf8")));
  const rows = {};
  for (const k of GA4_KEYS) rows[k] = await saveRow(k);
  fs.writeFileSync(BACKUP, JSON.stringify(rows, null, 2));
  return rows;
}
/** Liga o GA4 SEM ID de medicao (ID zerado antes de ligar) e confere no banco antes de qualquer disparo. */
async function ga4OnWithoutId() {
  await L.setSetting("ads.ga4.measurementId", "");
  await assertGa4Offline();
  await L.setSetting("ads.ga4.enabled", true);
}
async function assertGa4Offline() {
  const id = await one("select value from settings where key = 'ads.ga4.measurementId'");
  assert.ok(id && String(id.value ?? "").trim() === "", "ads.ga4.measurementId preenchido: o teste nao pode chamar o GA4 real");
}
/** Sem pixelId o meta-capi para antes da rede (mesma guarda do teste 20). */
async function assertNoPixel() {
  const r = await one("select value from settings where key = 'ads.meta.pixelId'");
  assert.ok(!r || String(r.value || "").trim() === "", "ads.meta.pixelId preenchido: rode node e2e/_setup.cjs on (o teste nao chama a Meta real)");
}

const asiRows = (token) => many("select destination, event_name, status, detail, payload, sent_at from conversion_events where event_id = $1 order by destination", [`asi-${token}`]);
const cartOf = (token) => one("select id, step, shipping_method, amount_cents, address_postal_code, address_number, ga_client_id from checkout_carts where token = $1", [token]);
const cartEvents = (cartId) => many("select destination, event_name, event_id, status, payload from conversion_events where cart_id = $1 order by event_name, destination", [cartId]);

async function waitFor(fn, what, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(400);
  }
  throw new Error(`banco: ${what} nao apareceu`);
}
/** Espera a linha do add_shipping_info sair de "sending" (o envio roda depois da resposta, em after()). */
const waitAsi = (token) =>
  waitFor(async () => {
    const rows = await asiRows(token);
    return rows.length && rows.every((r) => r.status !== "sending") ? rows : null;
  }, `add_shipping_info asi-${token.slice(0, 6)}...`);

async function waitToken(page, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const t = await L.cartTokenOf(page);
    if (t) return t;
    await sleep(300);
  }
  return null;
}

/** Navegador com consentimento aceito e o cookie _ga ficticio (e de onde o checkout tira o client_id). */
async function openCheckout() {
  const o = await L.open({ width: 1440, height: 900, consent: "accepted" });
  await o.context.addCookies([{ name: "_ga", value: GA_COOKIE, url: L.BASE }]);
  await L.goCheckout(o.page, "pack=unit&cor=azul");
  return o;
}

/** Confere o corpo gravado: molde dos outros eventos do GA4 + shipping_tier, e nada de dado pessoal. */
function checkBody(row, cart, tier, email) {
  assert.equal(row.destination, "ga4");
  assert.equal(row.event_name, "AddShippingInfo");
  // Sem ID de medicao o envio para antes da rede: e isso que prova que nada foi ao GA4 real.
  assert.equal(row.status, "error", `status ${row.status}: ${row.detail}`);
  assert.match(String(row.detail || ""), /ID de medição vazio/, `detalhe: ${row.detail}`);
  const body = row.payload;
  assert.ok(body && typeof body === "object", "linha sem payload");
  assert.equal(body.client_id, GA_CLIENT, "client_id deveria vir do cookie _ga");
  assert.equal(typeof body.timestamp_micros, "number");
  assert.equal(body.events.length, 1);
  const ev = body.events[0];
  assert.equal(ev.name, "add_shipping_info");
  assert.equal(ev.params.shipping_tier, tier);
  assert.equal(ev.params.currency, "BRL");
  assert.equal(ev.params.value, cart.amount_cents / 100, "value deveria ser o valor do carrinho");
  assert.equal(ev.params.items.length, 1);
  assert.equal(ev.params.items[0].quantity, 1);
  assert.equal(ev.params.items[0].price, ev.params.value);
  assert.ok(!("transaction_id" in ev.params), "transaction_id e so do purchase");
  const text = JSON.stringify(body);
  for (const pii of [email, L.cliente.name, L.cliente.phone, L.cliente.cpf, L.endereco.cep, L.endereco.street]) {
    assert.ok(!text.includes(pii), "dado pessoal no corpo do GA4");
  }
  return ev.params;
}

(async () => {
  await L.clearRateLimits();
  const backup = await backupGa4();
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => restoreGa4(backup).finally(() => process.exit(130)));
  const results = [];
  let valueFree = null;
  try {
    results.push(
      await L.scenario("30a", "GA4 desligado: add_shipping_info nao e gravado (nem na Meta)", async () => {
        await assertNoPixel();
        const en = await one("select value from settings where key = 'ads.ga4.enabled'");
        assert.ok(!en || en.value === false, "ads.ga4.enabled ligado: rode node e2e/_setup.cjs on");
        const body = {
          selection: { pack: "unit", colors: ["azul"] },
          step: "pagamento",
          customer: { name: L.cliente.name, email: `asi-off-${STAMP}@teste.test`, phone: L.cliente.phone, cpf: L.cliente.cpf },
          address: { cep: L.endereco.cep, street: L.endereco.street, number: L.endereco.number, district: L.endereco.district, city: L.endereco.city, state: L.endereco.state, recipient: L.cliente.name },
          tracking: { consent: true, gaClientId: GA_CLIENT },
        };
        const res = await fetch(`${L.BASE}/api/checkout/cart`, { method: "POST", headers: ORIGIN, body: JSON.stringify(body) });
        const json = await res.json();
        assert.equal(res.status, 200, `cart -> ${res.status} ${json.error || ""}`);
        const cart = await cartOf(json.token);
        assert.equal(cart.step, "pagamento");
        assert.ok(cart.address_postal_code, "endereco deveria estar gravado");
        // Os eventos saem em sequencia depois da resposta: quando o AddPaymentInfo da Meta aparece, o novo ja teria saido.
        await waitFor(async () => (await cartEvents(cart.id)).some((e) => e.event_name === "AddPaymentInfo"), "AddPaymentInfo da Meta");
        await sleep(1500);
        assert.equal((await asiRows(json.token)).length, 0, "add_shipping_info gravado com o GA4 desligado");
        const evs = await cartEvents(cart.id);
        assert.deepEqual([...new Set(evs.map((e) => e.destination))], ["meta"], "so a Meta deveria ter linhas");
        assert.deepEqual([...new Set(evs.map((e) => e.event_name))].sort(), ["AddPaymentInfo", "InitiateCheckout"], "eventos da Meta mudaram");
        return `carrinho ${json.token.slice(0, 6)}...: meta ${evs.map((e) => e.event_name).join(" + ")}, nenhum asi-`;
      }),
    );

    await assertNoPixel();
    await ga4OnWithoutId();

    // 30b e 30c usam o mesmo carrinho, no mesmo navegador.
    const a = await openCheckout();
    let tokenA = null;
    const emailA = `asi-gratis-${STAMP}@teste.test`;
    try {
      results.push(
        await L.scenario("30b", "Frete gratis: 1 add_shipping_info ao enviar a entrega, so no GA4", async () => {
          await assertGa4Offline();
          const { page } = a;
          await L.fillDados(page, { ...L.cliente, email: emailA });
          await L.submitDados(page);
          tokenA = await waitToken(page);
          assert.ok(tokenA, "carrinho nao nasceu");
          await L.fillEntrega(page);
          // Etapa 1 enviada e endereco digitado, mas a entrega ainda nao foi enviada: nada de add_shipping_info.
          const before = await cartOf(tokenA);
          await waitFor(async () => (await cartEvents(before.id)).some((e) => e.destination === "ga4" && e.event_name === "AddPaymentInfo"), "AddPaymentInfo do GA4");
          await sleep(1500);
          assert.equal((await asiRows(tokenA)).length, 0, "add_shipping_info saiu antes de a entrega ser enviada");

          await L.submitEntrega(page);
          const rows = await waitAsi(tokenA);
          assert.equal(rows.length, 1, `esperava 1 linha asi-, vieram ${rows.length} (${rows.map((r) => r.destination).join(", ")})`);
          const cart = await cartOf(tokenA);
          assert.equal(cart.step, "pagamento");
          assert.ok(cart.address_postal_code, "endereco deveria estar gravado");
          assert.equal(cart.shipping_method || "free", "free");
          assert.equal(cart.ga_client_id, GA_CLIENT, "client_id do cookie _ga nao chegou ao carrinho");
          const params = checkBody(rows[0], cart, "Frete grátis", emailA);
          valueFree = params.value;
          fs.writeFileSync(EXEMPLO, JSON.stringify(rows[0].payload, null, 2));

          // Os eventos antigos do GA4 seguem como eram: sem corpo gravado. E a Meta nao ganhou evento novo.
          const evs = await cartEvents(cart.id);
          const api = evs.find((e) => e.destination === "ga4" && e.event_name === "AddPaymentInfo");
          assert.ok(api, "AddPaymentInfo do GA4 sumiu");
          assert.equal(api.payload, null, "AddPaymentInfo do GA4 passou a gravar payload");
          const metaNames = [...new Set(evs.filter((e) => e.destination === "meta").map((e) => e.event_name))].sort();
          assert.ok(!metaNames.includes("AddShippingInfo"), "a Meta recebeu o evento novo");
          assert.ok(metaNames.includes("AddPaymentInfo"), "AddPaymentInfo da Meta deveria continuar saindo");
          // Rastreamento so no servidor: nenhum script/pixel carregado no checkout, mesmo com o GA4 ligado.
          L.checkNetwork(a.requests);
          return `asi-${tokenA.slice(0, 6)}...: shipping_tier "${params.shipping_tier}", value ${params.value}, status ${rows[0].status}`;
        }),
      );

      results.push(
        await L.scenario("30c", "Editar o endereco e reenviar: continua 1 evento, o mesmo", async () => {
          assert.ok(tokenA, "30b nao criou o carrinho");
          const { page } = a;
          // Simula o envio aceito pelo GA4 (linha "sent"). Linha em "error" seria retomada de proposito, como nos outros eventos.
          await withDb((c) => c.query("update conversion_events set status = 'sent', detail = 'e2e: simulado sent' where event_id = $1 and destination = 'ga4'", [`asi-${tokenA}`]));
          const [before] = await asiRows(tokenA);
          await L.editStep(page, "Editar entrega").click();
          await L.waitText(page.locator(".ck-step[aria-current=step]"), "Entrega");
          await L.field(page, "number").fill("1001");
          await L.submitEntrega(page);
          await waitFor(async () => (await cartOf(tokenA)).address_number === "1001", "numero novo no carrinho");
          await sleep(2500);
          const rows = await asiRows(tokenA);
          assert.equal(rows.length, 1, `editar o endereco duplicou o evento (${rows.length} linhas)`);
          assert.equal(rows[0].destination, "ga4");
          assert.equal(rows[0].status, "sent", "linha ja enviada foi mexida");
          assert.equal(rows[0].detail, "e2e: simulado sent");
          assert.deepEqual(rows[0].payload, before.payload, "corpo reescrito no reenvio");
          assert.equal(new Date(rows[0].sent_at).getTime(), new Date(before.sent_at).getTime(), "sent_at mudou: houve reenvio");
          assert.deepEqual(a.pageErrors, [], `erros na pagina: ${a.pageErrors.join(" | ")}`);
          return "endereco com numero 1001 gravado; 1 linha asi-, intacta";
        }),
      );
    } finally {
      await a.browser.close();
    }

    results.push(
      await L.scenario("30d", "Frete FULL: shipping_tier \"Frete FULL\" e valor com o frete", async () => {
        await assertGa4Offline();
        const b = await openCheckout();
        try {
          const { page } = b;
          const email = `asi-full-${STAMP}@teste.test`;
          await L.fillDados(page, { ...L.cliente, email });
          await L.submitDados(page);
          await L.fillEntrega(page);
          await page.locator('input[name="ship-option"][value="full"]').check();
          await L.waitText(page.locator(".ship-opt.is-selected"), /Frete FULL/);
          const token = await waitToken(page);
          assert.ok(token, "carrinho nao nasceu");
          await waitFor(async () => (await cartOf(token)).shipping_method === "full", "frete FULL no carrinho");
          assert.equal((await asiRows(token)).length, 0, "trocar o frete sem enviar a entrega nao deveria disparar");
          await L.submitCurrentForm(page);
          await page.locator(".pay-acc").waitFor({ timeout: 10000 });
          const rows = await waitAsi(token);
          assert.equal(rows.length, 1, `esperava 1 linha asi-, vieram ${rows.length}`);
          const cart = await cartOf(token);
          assert.equal(cart.shipping_method, "full");
          const params = checkBody(rows[0], cart, "Frete FULL", email);
          if (valueFree !== null) assert.ok(params.value > valueFree, `valor com FULL (${params.value}) deveria ser maior que no gratis (${valueFree})`);
          L.checkNetwork(b.requests);
          assert.deepEqual(b.pageErrors, [], `erros na pagina: ${b.pageErrors.join(" | ")}`);
          return `asi-${token.slice(0, 6)}...: shipping_tier "${params.shipping_tier}", value ${params.value}`;
        } finally {
          await b.browser.close();
        }
      }),
    );
  } finally {
    await restoreGa4(backup);
  }
  await L.clearRateLimits();
  const bad = results.filter((r) => !r).length;
  process.stdout.write(bad ? `\n${bad} cenario(s) falharam\n` : "\nTodos os cenarios passaram\n");
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  process.stderr.write(`erro: ${String(e && e.message ? e.message : e).slice(0, 400)}\n`);
  process.exit(1);
});
