/* eslint-disable @typescript-eslint/no-require-imports */
// 22 - Aviso "checkout aberto" + dados da empresa no rodape (pedido 2026-09-30-respostas-pendencias-checkout).
// Alvo: dev em http://localhost:3100 + banco local. Rodar: NODE_PATH="$(npm root -g)" node e2e/22-checkout-aberto.cjs
//
// Cenarios:
//  22a. Abrir /checkout gera 1 linha alerta_inicio no email_log (sem carrinho), assunto "Checkout aberto".
//  22b. Recarregar a mesma aba nao repete o aviso (id de visita no sessionStorage + limite por visita).
//  22c. Digitar o e-mail (carrinho nasce) nao gera outro alerta_inicio.
//  22d. /api/checkout/opened: origem de fora -> 403; corpo invalido -> 400.
//  22e. Rodape mostra CNPJ e endereco; sem rolagem lateral em 360px.
const L = require("./_lib.cjs");
const { assert, withDb } = L;

const ORIGIN = { origin: L.BASE, "content-type": "application/json" };

async function inicioSince(t0) {
  const r = await withDb((c) =>
    c.query("select subject, cart_id, status from email_log where template_key = 'alerta_inicio' and sent_at >= $1 order by sent_at", [t0]),
  );
  return r.rows;
}

async function waitRows(t0, n, ms = 15000) {
  const end = Date.now() + ms;
  let rows = [];
  while (Date.now() < end) {
    rows = await inicioSince(t0);
    if (rows.length >= n) return rows;
    await new Promise((r) => setTimeout(r, 500));
  }
  return rows;
}

(async () => {
  await L.clearRateLimits();
  const t0 = new Date();
  const results = [];
  const { browser, page, context, pageErrors } = await L.open({ width: 360, height: 780, mobile: true });
  try {
    results.push(
      await L.scenario("22a", "Abrir o checkout avisa a equipe", async () => {
        await L.goCheckout(page);
        const rows = await waitRows(t0, 1);
        assert.equal(rows.length, 1, `alerta_inicio=${rows.length}`);
        assert.ok(/Checkout aberto/.test(rows[0].subject), rows[0].subject);
        assert.equal(rows[0].cart_id, null, "aviso de abertura nao deveria ter carrinho");
        return `${rows[0].subject} (${rows[0].status})`;
      }),
    );
    results.push(
      await L.scenario("22b", "Recarregar nao repete o aviso", async () => {
        await page.reload({ waitUntil: "networkidle" });
        await new Promise((r) => setTimeout(r, 3000));
        const rows = await inicioSince(t0);
        assert.equal(rows.length, 1, `alerta_inicio=${rows.length}`);
        return "1 aviso so";
      }),
    );
    results.push(
      await L.scenario("22c", "Carrinho novo nao gera outro alerta_inicio", async () => {
        await L.fillDados(page);
        await new Promise((r) => setTimeout(r, 4000));
        const rows = await inicioSince(t0);
        assert.equal(rows.length, 1, `alerta_inicio=${rows.length}`);
        return "sem aviso duplicado";
      }),
    );
    results.push(
      await L.scenario("22d", "Rota recusa origem de fora e corpo invalido", async () => {
        const bad = await context.request.post(`${L.BASE}/api/checkout/opened`, {
          headers: { origin: "https://evil.example", "content-type": "application/json" },
          data: { visit: "abcdefgh12", selection: { pack: "unit", colors: ["azul"] } },
        });
        assert.equal(bad.status(), 403);
        const inv = await context.request.post(`${L.BASE}/api/checkout/opened`, { headers: ORIGIN, data: { visit: "x", selection: { pack: "kit", colors: ["azul"] } } });
        assert.equal(inv.status(), 400);
        return "403 / 400";
      }),
    );
    results.push(
      await L.scenario("22e", "Rodape com CNPJ e endereco", async () => {
        const text = await page.locator(".ck-footer-bottom").innerText();
        assert.ok(text.includes("CNPJ 55.212.611/0001-95"), text);
        assert.ok(text.includes("Rua Trajano, nº 199"), text);
        await L.noHorizontalScroll(page);
        await page.locator(".ck-footer-bottom").scrollIntoViewIfNeeded();
        await L.shot(page, "22-rodape-360", false);
        return "CNPJ + endereco";
      }),
    );
    assert.deepEqual(pageErrors, [], `erros na pagina: ${pageErrors.join(" | ")}`);
  } finally {
    await browser.close();
    await L.clearRateLimits();
  }
  const bad = results.filter((r) => !r).length;
  process.stdout.write(bad ? `\n${bad} cenario(s) falharam\n` : "\nTodos os cenarios passaram\n");
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  process.stderr.write(`erro: ${String(e && e.message ? e.message : e).slice(0, 400)}\n`);
  process.exit(1);
});
