/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 6: ate 2026-10-05 conferia o cronometro da oferta (theme.timerEnd 2026-10-12 23:59:59 -03:00). O cronometro
//            saiu do checkout na virada de verao; o cenario agora garante que nenhuma contagem aparece em volta dessa data.
// Cenario 7: Pix expira no prazo configurado (checkout.pixTtlSeconds, 10 min) e pode ser gerado de novo.
// Os dois usam o relogio falso do Playwright (so o navegador; o servidor segue na hora real).
const L = require("./_lib.cjs");
const { assert } = L;

async function cronometro(variant) {
  const { browser, context, page, pageErrors } = await L.open(variant);
  try {
    await context.clock.install({ time: new Date("2026-10-12T23:59:50-03:00") });
    await L.goCheckout(page);
    // O cronômetro da oferta (.ck-timer) foi retirado de propósito na virada de verão (commit 9f5d313, 2026-10-05;
    // TopBar.tsx: "a oferta de verão não tem data nem contagem regressiva"). A verificação antiga (contar até
    // theme.timerEnd e sumir) não tem mais o que conferir; fica a garantia inversa: nenhuma contagem aparece,
    // nem 10 s antes nem depois do fim antigo da oferta, e a virada do relógio não quebra a página.
    assert.equal(await page.locator(".ck-timer").count(), 0, "checkout não deveria mostrar o cronômetro da oferta");
    assert.equal(await page.locator(".ship-bar, .ck-top").getByText(/\d{2}d \d{2}:\d{2}:\d{2}/).count(), 0, "nenhuma contagem regressiva no topo");
    await page.clock.fastForward(15000);
    assert.equal(await page.locator(".ck-timer").count(), 0, "cronômetro não deveria aparecer depois do fim antigo da oferta");
    await L.waitText(page.locator(".ck-season-badge"), "Ambiente protegido");
    await L.noHorizontalScroll(page);
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
}

async function pixExpira(variant) {
  const { browser, context, page, requests, pageErrors } = await L.open(variant);
  try {
    await context.clock.install({ time: new Date("2026-09-26T12:00:00-03:00") });
    // Atrasa a resposta do /pay para dar tempo de ver o estado "Gerando Pix…".
    await page.route("**/api/checkout/pay", async (r) => { await new Promise((ok) => setTimeout(ok, 700)); await r.continue(); });
    await L.toPayment(page);
    await L.waitText(page.locator(".ck-step[aria-current=step]"), "Pagamento");
    await L.choosePix(page); // cartao abre selecionado por padrao desde 2026-09-28
    // Tela do Pix redesenhada (a446b8c): botao "Gerar código Pix" (.pix-payment-start) e estado "Gerando código…".
    await page.locator(".pix-payment-start .pix-primary").click();
    const gerando = page.getByRole("button", { name: "Gerando código…" });
    await gerando.waitFor({ timeout: 3000 });
    assert.ok(await gerando.isDisabled(), "botao deveria ficar desabilitado enquanto gera");
    const code = L.field(page, "pix-code");
    await code.waitFor({ state: "attached", timeout: 15000 });
    assert.match(await code.inputValue(), /^SIMULADO-NAO-PAGUE-sim_/);
    await page.clock.fastForward("10:01");
    await L.waitText(page.locator(".pix-payment-expired"), "Vamos gerar um novo código?");
    await L.shot(page, `c7-${variant.tag}-pix-expirado`);
    await L.btn(page, "Gerar novo código Pix").click();
    await L.waitText(L.pixCountdown(page), /^(10:00|09:5\d)$/, 15000); // antes ".pix-validity b"
    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
}

module.exports = { cronometro, pixExpira };

if (require.main === module) {
  (async () => {
    await L.clearRateLimits();
    await L.scenario("06-desktop", "Sem cronometro de oferta, antes e depois do fim antigo (1440)", () => cronometro({ width: 1440, height: 900, tag: "desktop" }));
    await L.scenario("06-mobile", "Sem cronometro de oferta, antes e depois do fim antigo (412 mobile)", () => cronometro({ width: 412, height: 915, tag: "mobile", mobile: true }));
    await L.scenario("07-desktop", "Pix expira em 10 min e gera de novo (1440)", () => pixExpira({ width: 1440, height: 900, tag: "desktop" }));
    await L.clearRateLimits();
    await L.scenario("07-mobile", "Pix expira em 10 min e gera de novo (412 mobile)", () => pixExpira({ width: 412, height: 915, tag: "mobile", mobile: true }));
  })();
}
