/* eslint-disable @typescript-eslint/no-require-imports */
// 26 - Purchase que falhou por rede volta a ser enviado (pedido 2026-09-30-purchase-nao-chegou-meta).
// Alvo: dev em http://localhost:3100 + banco local. Pre-requisito: `node e2e/_setup.cjs on` (Meta ligada SEM pixelId:
// nada vai a Meta real; o reenvio termina em "error: Pixel ID vazio", que NAO e passageiro e prova que passou pelo envio).
// Rodar: NODE_PATH="$(npm root -g)" node e2e/26-purchase-reenvio.cjs
//
// Cenarios:
//  26a. Linha Purchase em error por ETIMEDOUT: o cron tracking-sync reenvia (mesmo event_id).
//  26b. Linha em error por HTTP 400 (permanente): o cron nao mexe.
//  26c. Pago ha 8 dias (fora da janela de 7 dias da Meta): o cron nao mexe.
//  26d. Botao "Reenviar compra para a Meta" no pedido: tenta de novo; com a linha ja "sent" responde duplicado.
//  26e. Pagamento marcado como Pago a mao: grava o Purchase pur-<pedido>.
// Liga ads.consentRequired=false durante o teste (como em producao) e apaga a chave no fim.
const L = require("./_lib.cjs");
const { loadEnv } = require("./_env.cjs");
const { assert, withDb } = L;

const STAMP = Date.now().toString(36).toUpperCase();
const N = (s) => `E2E-PUR-${s}-${STAMP}`;
const one = async (sql, args) => (await withDb((c) => c.query(sql, args))).rows[0];
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const items = JSON.stringify([{ sku: "AQB-1UN-AZUL", name: "1 unidade AquaBlast", variant: "Azul", quantity: 1, unitPrice: 159.9 }]);
const created = [];

async function makeOrder(num, { paid = true, paidAgo = "1 hour" } = {}) {
  const o = await one(
    `insert into orders (order_number, checkout_provider, status, payment_status, payment_method, customer_name, customer_email, items, amount_total, paid_at, created_at, updated_at)
     values ($1, 'proprio', $2, $3, 'pix', 'Cliente Purchase E2E', $4, $5::jsonb, 159.90, ${paid ? `now() - interval '${paidAgo}'` : "null"}, now() - interval '${paidAgo}', now()) returning id`,
    [num, paid ? "approved" : "created", paid ? "paid" : "pending", `${num.toLowerCase()}@teste.test`, items],
  );
  created.push(o.id);
  return o.id;
}
async function errorRow(orderId, num, detail) {
  await withDb((c) =>
    c.query("insert into conversion_events (order_id, destination, event_name, event_id, status, detail, sent_at) values ($1, 'meta', 'Purchase', $2, 'error', $3, now() - interval '20 minutes')", [orderId, `pur-${num}`, detail]),
  );
}
const rowOf = (num) => one("select status, detail from conversion_events where destination = 'meta' and event_name = 'Purchase' and event_id = $1", [`pur-${num}`]);

async function cron() {
  const secret = process.env.CRON_SECRET || loadEnv().CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET ausente no .env");
  const r = await fetch(`${L.BASE}/api/cron/tracking-sync`, { headers: { authorization: `Bearer ${secret}` } });
  assert.equal(r.status, 200, `cron tracking-sync -> ${r.status}`);
  return r.json();
}
async function login(page) {
  await page.goto(`${L.BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Entrada r[aá]pida/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30000 });
}

(async () => {
  const results = [];
  const A = N("A"), B = N("B"), C = N("C"), D = N("D"), E = N("E");
  // Igual a producao (2026-09-30): consentimento nao obrigatorio. Com ele ligado e pedido sem consentimento, o
  // dispatch grava "sem consentimento" e nao reenvia (regra mantida de proposito).
  await L.setSetting("ads.consentRequired", false);
  try {
    const idA = await makeOrder(A);
    await errorRow(idA, A, "Meta: falha de rede (fetch failed: ETIMEDOUT)");
    const idB = await makeOrder(B);
    await errorRow(idB, B, "Meta HTTP 400: Invalid parameter [code 100]");
    const idC = await makeOrder(C, { paidAgo: "8 days" });
    await errorRow(idC, C, "Meta: falha de rede (fetch failed: ETIMEDOUT)");

    let body = null;
    results.push(
      await L.scenario("26a", "Cron reenvia Purchase em error por ETIMEDOUT", async () => {
        body = await cron();
        const row = await rowOf(A);
        assert.ok(!/ETIMEDOUT/.test(row.detail), `nao reenviou: ${row.detail}`);
        return `ads=${JSON.stringify(body.ads)} -> ${row.status}: ${row.detail}`;
      }),
    );
    results.push(
      await L.scenario("26b", "Erro 400 (permanente) nao e reenviado", async () => {
        const row = await rowOf(B);
        assert.match(row.detail, /HTTP 400/);
        return row.detail;
      }),
    );
    results.push(
      await L.scenario("26c", "Pago ha 8 dias nao e reenviado", async () => {
        const row = await rowOf(C);
        assert.match(row.detail, /ETIMEDOUT/);
        return "fora da janela";
      }),
    );

    const idD = await makeOrder(D);
    await errorRow(idD, D, "Meta: falha de rede (fetch failed: ETIMEDOUT)");
    const idE = await makeOrder(E, { paid: false });
    const { browser, page, pageErrors } = await L.open({ width: 1366, height: 900, consent: null });
    try {
      await login(page);
      results.push(
        await L.scenario("26d", "Botao Reenviar compra: tenta de novo e nao duplica", async () => {
          await page.goto(`${L.BASE}/admin/pedidos/${idD}`, { waitUntil: "networkidle" });
          const btn = page.getByRole("button", { name: "Reenviar compra para a Meta" });
          await btn.click();
          await L.waitText(page.locator("body"), /Meta: (erro|enviado|não enviado)/);
          const row = await rowOf(D);
          assert.ok(!/ETIMEDOUT/.test(row.detail), `nao reenviou: ${row.detail}`);
          await withDb((c) => c.query("update conversion_events set status = 'sent', detail = 'e2e: simulado sent' where event_id = $1", [`pur-${D}`]));
          await page.goto(`${L.BASE}/admin/pedidos/${idD}`, { waitUntil: "networkidle" });
          await page.getByRole("button", { name: "Reenviar compra para a Meta" }).click();
          await L.waitText(page.locator("body"), /duplicado/);
          const again = await rowOf(D);
          assert.equal(again.detail, "e2e: simulado sent", "reenviou o que ja estava sent");
          return `1a: ${row.detail.slice(0, 60)} · 2a: duplicado`;
        }),
      );
      results.push(
        await L.scenario("26e", "Pago a mao grava Purchase pur-<pedido>", async () => {
          await page.goto(`${L.BASE}/admin/pedidos/${idE}`, { waitUntil: "networkidle" });
          const form = page.locator("form").filter({ has: page.locator('select[name="paymentStatus"]') });
          await form.locator('select[name="paymentStatus"]').selectOption("paid");
          await form.getByRole("button", { name: "Aplicar" }).click();
          let row = null;
          for (let i = 0; i < 30 && !row; i++) {
            await sleep(500);
            row = await rowOf(E);
          }
          assert.ok(row, "sem linha Purchase");
          return `${row.status}: ${row.detail}`;
        }),
      );
      assert.deepEqual(pageErrors, [], `erros na pagina: ${pageErrors.join(" | ")}`);
    } finally {
      await browser.close();
    }
  } finally {
    await withDb((c) => c.query("delete from conversion_events where order_id = any($1::uuid[])", [created]));
    await withDb((c) => c.query("delete from order_events where order_id = any($1::uuid[])", [created])).catch(() => {});
    await withDb((c) => c.query("delete from orders where id = any($1::uuid[])", [created]));
    await L.deleteSetting("ads.consentRequired").catch(() => {});
  }
  const bad = results.filter((r) => !r).length;
  process.stdout.write(bad ? `\n${bad} cenario(s) falharam\n` : "\nTodos os cenarios passaram\n");
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  process.stderr.write(`erro: ${String(e && e.message ? e.message : e).slice(0, 400)}\n`);
  process.exit(1);
});
