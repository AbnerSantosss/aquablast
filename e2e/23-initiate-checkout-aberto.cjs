/* eslint-disable @typescript-eslint/no-require-imports */
// 23 - InitiateCheckout (Meta CAPI) na ABERTURA do checkout, 1 por visita (pedido 2026-09-30-initiatecheckout-na-abertura).
// Alvo: dev em http://localhost:3100 + banco local. Pre-requisito: `node e2e/_setup.cjs on` (Meta ligada SEM pixelId:
// nenhuma chamada a Meta real; a linha fica em conversion_events com status "error", e o teste simula o "sent").
// Rodar: NODE_PATH="$(npm root -g)" node e2e/23-initiate-checkout-aberto.cjs
//
// Cenarios:
//  23a. Abrir /checkout (consentimento aceito) gera 1 InitiateCheckout com event_id ic-<visit>, sem carrinho.
//  23b. Recarregar a mesma aba nao gera outro (mesma visita; linha ja "sent" nao e reenviada).
//  23c. Preencher os dados (carrinho nasce) nao gera um 2o InitiateCheckout: o carrinho usa o mesmo ic-<visit>.
//  23d. Consentimento recusado (ads.consentRequired ligado): abrir nao grava nada.
const L = require("./_lib.cjs");
const { assert, withDb } = L;

async function icRowsSince(t0) {
  const r = await withDb((c) =>
    c.query(
      "select event_id, status, detail, cart_id, sent_at from conversion_events where destination = 'meta' and event_name = 'InitiateCheckout' and sent_at >= $1 order by sent_at",
      [t0],
    ),
  );
  return r.rows;
}

async function waitIc(t0, n, ms = 15000) {
  const end = Date.now() + ms;
  let rows = [];
  while (Date.now() < end) {
    rows = await icRowsSince(t0);
    if (rows.length >= n) return rows;
    await new Promise((r) => setTimeout(r, 500));
  }
  return rows;
}

const visitOf = (page) => page.evaluate(() => sessionStorage.getItem("aqb-ck-visit"));

(async () => {
  await L.clearRateLimits();
  const t0 = new Date();
  const results = [];
  const { browser, page, pageErrors } = await L.open({ width: 360, height: 780, mobile: true, consent: "accepted" });
  let visit = "";
  try {
    results.push(
      await L.scenario("23a", "Abrir o checkout manda 1 InitiateCheckout ic-<visit>", async () => {
        await L.goCheckout(page);
        visit = await visitOf(page);
        assert.ok(visit, "sem id de visita no sessionStorage");
        const rows = await waitIc(t0, 1);
        assert.equal(rows.length, 1, `InitiateCheckout=${rows.length}`);
        assert.equal(rows[0].event_id, `ic-${visit}`);
        assert.equal(rows[0].cart_id, null, "abertura nao tem carrinho");
        // Sem pixelId o envio fica "error"; simula a Meta aceitando para provar que nada e reenviado depois.
        await withDb((c) => c.query("update conversion_events set status = 'sent', detail = 'e2e: simulado sent' where destination = 'meta' and event_name = 'InitiateCheckout' and event_id = $1", [`ic-${visit}`]));
        return `${rows[0].event_id} (${rows[0].status}: ${rows[0].detail})`;
      }),
    );
    results.push(
      await L.scenario("23b", "Recarregar nao gera outro InitiateCheckout", async () => {
        await page.reload({ waitUntil: "networkidle" });
        await new Promise((r) => setTimeout(r, 4000));
        assert.equal(await visitOf(page), visit, "a visita mudou ao recarregar");
        const rows = await icRowsSince(t0);
        assert.equal(rows.length, 1, `InitiateCheckout=${rows.length}`);
        assert.equal(rows[0].detail, "e2e: simulado sent", "a linha foi reenviada");
        return "1 so";
      }),
    );
    results.push(
      await L.scenario("23c", "Carrinho novo reusa ic-<visit> e nao manda outro", async () => {
        await L.fillDados(page);
        await L.submitDados(page);
        const token = await L.cartTokenOf(page);
        assert.ok(token, "carrinho nao nasceu");
        await new Promise((r) => setTimeout(r, 4000));
        const rows = await icRowsSince(t0);
        assert.equal(rows.length, 1, `InitiateCheckout=${rows.map((r) => r.event_id).join(", ")}`);
        assert.equal(rows[0].event_id, `ic-${visit}`);
        assert.equal(rows[0].detail, "e2e: simulado sent", "o carrinho reenviou");
        const byToken = await withDb((c) => c.query("select 1 from conversion_events where event_id = $1", [`ic-${token}`]));
        assert.equal(byToken.rowCount, 0, "carrinho criou ic-<token>");
        return `carrinho ${token.slice(0, 6)}... sem 2o evento`;
      }),
    );
    assert.deepEqual(pageErrors, [], `erros na pagina: ${pageErrors.join(" | ")}`);
  } finally {
    await browser.close();
  }

  const declined = await L.open({ width: 360, height: 780, mobile: true, consent: "declined" });
  try {
    results.push(
      await L.scenario("23d", "Consentimento recusado: abrir nao grava InitiateCheckout", async () => {
        await L.clearRateLimits();
        await L.goCheckout(declined.page);
        const v = await visitOf(declined.page);
        await new Promise((r) => setTimeout(r, 4000));
        const r = await withDb((c) => c.query("select 1 from conversion_events where event_id = $1", [`ic-${v}`]));
        assert.equal(r.rowCount, 0, "gravou evento sem consentimento");
        return "nada gravado";
      }),
    );
  } finally {
    await declined.browser.close();
    await L.clearRateLimits();
  }
  const bad = results.filter((r) => !r).length;
  process.stdout.write(bad ? `\n${bad} cenario(s) falharam\n` : "\nTodos os cenarios passaram\n");
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  process.stderr.write(`erro: ${String(e && e.message ? e.message : e).slice(0, 400)}\n`);
  process.exit(1);
});
