/* eslint-disable @typescript-eslint/no-require-imports */
// 24 - `ads.consentRequired` desligado no painel: o checkout nao mostra o banner de cookies e o carrinho
// guarda fbp/fbc e utm_* mesmo de quem recusou antes (decisao do dono, 2026-09-30).
// Alvo: dev em http://localhost:3100 + banco local. Rodar: NODE_PATH="$(npm root -g)" node e2e/24-sem-consentimento-obrigatorio.cjs
const L = require("./_lib.cjs");
const { assert, withDb } = L;

(async () => {
  await L.clearRateLimits();
  await L.setSetting("ads.consentRequired", false);
  const results = [];
  for (const consent of [null, "declined"]) {
    const { browser, context, page } = await L.open({ width: 360, height: 780, mobile: true, consent });
    try {
      results.push(
        await L.scenario(`24${consent ? "b" : "a"}`, `Sem banner e com fbp/fbc/utm (resposta salva: ${consent ?? "nenhuma"})`, async () => {
          await context.addCookies([
            { name: "_fbp", value: "fb.1.1700000000000.123456789", url: "http://localhost:3100" },
            { name: "_fbc", value: "fb.1.1700000000000.AbCdEf", url: "http://localhost:3100" },
          ]);
          await L.goCheckout(page, "pack=unit&cor=azul&utm_source=facebook&utm_campaign=vendas-e2e");
          await new Promise((r) => setTimeout(r, 1500));
          assert.equal(await page.locator(".ck-consent").count(), 0, "banner apareceu");
          await L.fillDados(page);
          await L.submitDados(page);
          const token = await L.cartTokenOf(page);
          assert.ok(token, "carrinho nao nasceu");
          const r = await withDb((c) => c.query("select consent, fbp, fbc, utm from checkout_carts where token = $1", [token]));
          const cart = r.rows[0];
          assert.equal(cart.consent, true, "consent");
          assert.equal(cart.fbp, "fb.1.1700000000000.123456789");
          assert.equal(cart.fbc, "fb.1.1700000000000.AbCdEf");
          assert.equal(cart.utm && cart.utm.utm_campaign, "vendas-e2e");
          return `carrinho ${token.slice(0, 6)}... com fbp/fbc/utm`;
        }),
      );
    } finally {
      await browser.close();
    }
  }
  await L.deleteSetting("ads.consentRequired");
  await L.clearRateLimits();
  const bad = results.filter((r) => !r).length;
  process.stdout.write(bad ? `\n${bad} cenario(s) falharam\n` : "\nTodos os cenarios passaram\n");
  process.exit(bad ? 1 : 0);
})().catch(async (e) => {
  await L.deleteSetting("ads.consentRequired").catch(() => {});
  process.stderr.write(`erro: ${String(e && e.message ? e.message : e).slice(0, 400)}\n`);
  process.exit(1);
});
