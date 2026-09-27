/* eslint-disable @typescript-eslint/no-require-imports */
// Cenario 6: cronometro conta ate o fim da oferta (theme.timerEnd 2026-10-12 23:59:59 -03:00) e some depois.
// Cenario 7: Pix expira no prazo configurado (checkout.pixTtlSeconds, 10 min) e pode ser gerado de novo.
// Os dois usam o relogio falso do Playwright (so o navegador; o servidor segue na hora real).
const L = require("./_lib.cjs");
const { assert } = L;

async function cronometro(variant) {
  const { browser, context, page, pageErrors } = await L.open(variant);
  try {
    await context.clock.install({ time: new Date("2026-10-12T23:59:50-03:00") });
    await L.goCheckout(page);
    await L.waitText(page.locator(".ck-timer b"), /^00d 00:00:(0\d|10)$/);
    assert.equal(await page.locator(".ck-timer").getAttribute("aria-live"), "off");
    await page.clock.fastForward(15000);
    await page.locator(".ck-timer").waitFor({ state: "detached", timeout: 5000 });
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
    await L.btn(page, "FINALIZAR COMPRA").click();
    const gerando = page.getByRole("button", { name: "Gerando Pix…" });
    await gerando.waitFor({ timeout: 3000 });
    assert.ok(await gerando.isDisabled(), "botao deveria ficar desabilitado enquanto gera");
    const code = L.field(page, "pix-code");
    await code.waitFor({ timeout: 15000 });
    assert.match(await code.inputValue(), /^SIMULADO-NAO-PAGUE-sim_/);
    await page.clock.fastForward("10:01");
    await L.waitText(page.locator(".ck-pix-expired"), "Código expirado");
    await L.shot(page, `c7-${variant.tag}-pix-expirado`);
    await L.btn(page, "Gerar novo Pix").click();
    await L.waitText(page.locator(".ck-pix-timer b"), /^(10:00|09:5\d)$/, 15000);
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
    await L.scenario("06-desktop", "Cronometro conta ate o fim e some (1440)", () => cronometro({ width: 1440, height: 900, tag: "desktop" }));
    await L.scenario("06-mobile", "Cronometro conta ate o fim e some (412 mobile)", () => cronometro({ width: 412, height: 915, tag: "mobile", mobile: true }));
    await L.scenario("07-desktop", "Pix expira em 10 min e gera de novo (1440)", () => pixExpira({ width: 1440, height: 900, tag: "desktop" }));
    await L.clearRateLimits();
    await L.scenario("07-mobile", "Pix expira em 10 min e gera de novo (412 mobile)", () => pixExpira({ width: 412, height: 915, tag: "mobile", mobile: true }));
  })();
}
