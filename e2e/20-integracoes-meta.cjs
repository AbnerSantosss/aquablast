/* eslint-disable @typescript-eslint/no-require-imports */
// 20 - Integracoes: Meta (eventos marcados, modo teste, token mascarado) e verificacao do e-mail
// (etapa D do pedido 2026-09-30-rastreio-sla-pix-qr-bump-cor-pixels).
// Alvo: dev em http://localhost:3100 + banco local + coletor SMTP 127.0.0.1:2525 (e2e/_smtp-sink.cjs).
// Pre-requisito: `node e2e/_setup.cjs on` (Meta ligada SEM pixelId, SMTP no coletor). Sem pixelId nenhum
// evento sai para a rede; este script confere isso antes de salvar qualquer coisa. Nunca chama a Meta real
// e nunca usa token real: o token de teste e falso e montado aqui (nao e impresso).
// Rodar: NODE_PATH="$(npm root -g)" node e2e/20-integracoes-meta.cjs
//
// Cenarios:
//  20a. meta-body.ts (transpilado): test_event_code so vai no corpo com o modo teste ligado.
//  20b. /admin/pixels: token salvo aparece mascarado (nunca inteiro no HTML); modo teste liga/desliga o aviso vermelho.
//  20c. Purchase desmarcado: carrinho + Pix simulado pago -> linha meta pur-<pedido> "ignorado" (evento desmarcado);
//       InitiateCheckout marcado nao e barrado pelo filtro.
//  20d. /admin/configuracoes, aba E-mail: "Verificar conexao" mostra o selo "Conectado" (SMTP do coletor).
// No fim devolve as linhas cruas de settings que mexeu (inclusive integrations.status).
const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const L = require("./_lib.cjs");
const { assert, withDb } = L;

const STAMP = Date.now().toString(36).toUpperCase();
const ORIGIN = { origin: L.BASE, "content-type": "application/json" };
const one = async (sql, args) => (await withDb((c) => c.query(sql, args))).rows[0];
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
// Token FALSO no formato da Meta (EAA + 30 caracteres). Montado em partes para nao parecer segredo no repositorio.
const FAKE_TOKEN = ["EAA", "E2E", "falso", STAMP, "x".repeat(30)].join("").slice(0, 33);
const FAKE_MASK = FAKE_TOKEN.slice(0, 4) + "••••••••" + FAKE_TOKEN.slice(-4);

const TOUCHED = [
  "ads.meta.enabled",
  "ads.meta.pixelId",
  "ads.meta.accessToken",
  "ads.meta.testEventCode",
  "ads.meta.testMode",
  "ads.meta.events",
  "integrations.status",
];

async function saveRow(key) {
  return (await withDb((c) => c.query("select value, encrypted, updated_by from settings where key = $1", [key]))).rows[0] || null;
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
function portOpen(port) {
  return new Promise((ok) => {
    const s = net.connect({ host: "127.0.0.1", port }, () => {
      s.end();
      ok(true);
    });
    s.on("error", () => ok(false));
  });
}
async function login(page) {
  await page.goto(`${L.BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Entrada r[aá]pida/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30000 });
}
/** Garante que nenhum envio vai para a Meta real: sem pixelId o meta-capi para antes da rede. */
async function assertNoPixel() {
  const r = await one("select value from settings where key = 'ads.meta.pixelId'");
  assert.ok(!r || String(r.value || "").trim() === "", "ads.meta.pixelId preenchido: rode node e2e/_setup.cjs on (o teste nao chama a Meta real)");
}
async function waitRow(sql, args, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const r = await one(sql, args);
    if (r) return r;
    await sleep(300);
  }
  throw new Error(`linha nao apareceu: ${args.join(", ")}`);
}
/** Cartao do Meta na tela Pixels (primeiro cartao com o titulo). */
const metaCard = (page) => page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Meta Conversions API" }) });

(async () => {
  let sink = null;
  const backup = {};
  for (const k of TOUCHED) backup[k] = await saveRow(k);
  const results = [];
  try {
    results.push(
      await L.scenario("20a", "Meta: test_event_code so com o modo teste ligado", async () => {
        const ts = require(path.join(__dirname, "..", "node_modules", "typescript"));
        const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "tracking-ads", "meta-body.ts"), "utf8");
        const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        const mod = { exports: {} };
        new Function("module", "exports", js)(mod, mod.exports);
        const { effectiveTestEventCode, metaRequestBody } = mod.exports;
        const ev = [{ event_name: "Purchase", event_id: "pur-X" }];
        const off = metaRequestBody(ev, effectiveTestEventCode({ testMode: false, testEventCode: "TEST123" }));
        assert.ok(!("test_event_code" in off), "modo teste desligado ainda manda test_event_code");
        const on = metaRequestBody(ev, effectiveTestEventCode({ testMode: true, testEventCode: " TEST123 " }));
        assert.equal(on.test_event_code, "TEST123");
        const onEmpty = metaRequestBody(ev, effectiveTestEventCode({ testMode: true, testEventCode: "" }));
        assert.ok(!("test_event_code" in onEmpty), "codigo vazio nao pode ir no corpo");
        // O envio real (sendMetaEvent) tem de passar pelo effectiveTestEventCode.
        const capi = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "tracking-ads", "meta-capi.ts"), "utf8");
        assert.match(capi, /effectiveTestEventCode\(cfg\)/, "sendMetaEvent nao usa effectiveTestEventCode");
        return "off: sem test_event_code; on: TEST123; on sem codigo: sem campo";
      }),
    );

    await assertNoPixel();
    const { browser, page, pageErrors } = await L.open({ width: 1366, height: 768, consent: null });
    try {
      await login(page);

      results.push(
        await L.scenario("20b", "Pixels: token mascarado e aviso do modo teste", async () => {
          await page.goto(`${L.BASE}/admin/pixels`, { waitUntil: "networkidle" });
          const card = metaCard(page);
          const trocar = card.getByRole("button", { name: "Trocar", exact: true });
          if (await trocar.count()) await trocar.first().click();
          await card.locator('input[name="ads.meta.accessToken"]').fill(FAKE_TOKEN);
          await card.locator('input[name="ads.meta.testEventCode"]').fill("E2ETEST1");
          await card.locator('input[name="ads.meta.testMode"]').check();
          await card.getByRole("button", { name: "Salvar Meta", exact: true }).click();
          await L.waitText(card.locator(".af-result"), /Configurações da Meta salvas.*modo teste ligado/);

          await page.goto(`${L.BASE}/admin/pixels`, { waitUntil: "networkidle" });
          const html = await page.content();
          assert.ok(!html.includes(FAKE_TOKEN), "token inteiro apareceu no HTML do painel");
          const raw = await (await page.context().request.get(`${L.BASE}/admin/pixels`)).text();
          assert.ok(!raw.includes(FAKE_TOKEN), "token inteiro apareceu na resposta do servidor (RSC)");
          await L.waitText(metaCard(page).locator(".secret-mask"), FAKE_MASK);
          assert.equal(await metaCard(page).locator('input[name="ads.meta.accessToken"]').count(), 0, "input do token aberto sem clicar em Trocar");
          await L.waitText(metaCard(page).locator('[role="alert"]'), /Modo teste ligado/);

          // Desliga o modo teste: o aviso some e o codigo continua salvo.
          await metaCard(page).locator('input[name="ads.meta.testMode"]').uncheck();
          await metaCard(page).getByRole("button", { name: "Salvar Meta", exact: true }).click();
          await L.waitText(metaCard(page).locator(".af-result"), /Configurações da Meta salvas/);
          await page.goto(`${L.BASE}/admin/pixels`, { waitUntil: "networkidle" });
          assert.equal(await metaCard(page).locator('[role="alert"]').count(), 0, "aviso vermelho com o modo teste desligado");
          assert.equal(await metaCard(page).locator('input[name="ads.meta.testEventCode"]').inputValue(), "E2ETEST1");
          const mode = await one("select value from settings where key = 'ads.meta.testMode'");
          assert.equal(mode && mode.value, false);
          return `mascara ${FAKE_MASK.replace(/•/g, "*")}; token fora do HTML e do RSC; aviso so com modo teste`;
        }),
      );

      results.push(
        await L.scenario("20c", "Purchase desmarcado nao vai para a Meta", async () => {
          await assertNoPixel();
          await L.clearRateLimits();
          await L.setSetting("ads.meta.events", ["InitiateCheckout", "AddPaymentInfo"]);
          const email = `meta-${STAMP.toLowerCase()}@teste.test`;
          const cartBody = {
            selection: { pack: "unit", colors: ["azul"] },
            step: "pagamento",
            customer: { name: L.cliente.name, email, phone: L.cliente.phone, cpf: L.cliente.cpf },
            address: { cep: L.endereco.cep, street: L.endereco.street, number: L.endereco.number, district: L.endereco.district, city: L.endereco.city, state: L.endereco.state, recipient: L.cliente.name },
            tracking: { consent: true },
          };
          const c = await fetch(`${L.BASE}/api/checkout/cart`, { method: "POST", headers: ORIGIN, body: JSON.stringify(cartBody) });
          const cj = await c.json();
          assert.equal(c.status, 200, `cart -> ${c.status} ${cj.error || ""}`);
          const p = await fetch(`${L.BASE}/api/checkout/pay`, { method: "POST", headers: ORIGIN, body: JSON.stringify({ cartToken: cj.token, method: "pix", installments: 1, bump: false }) });
          const pj = await p.json();
          assert.ok(p.ok && pj.publicToken, `pay -> ${p.status} ${pj.error || pj.message || ""}`);
          const sim = await fetch(`${L.BASE}/api/checkout/simular-pagamento`, { method: "POST", headers: ORIGIN, body: JSON.stringify({ publicToken: pj.publicToken }) });
          assert.equal(sim.status, 200, `simular-pagamento -> ${sim.status}`);

          const pur = await waitRow("select status, detail from conversion_events where event_id = $1 and destination = 'meta'", [`pur-${pj.orderNumber}`]);
          assert.equal(pur.status, "skipped", `Purchase meta: ${pur.status} ${pur.detail}`);
          assert.match(String(pur.detail || ""), /desmarcado/, `detalhe do Purchase: ${pur.detail}`);
          const ic = await waitRow("select status, detail from conversion_events where event_id = $1 and destination = 'meta'", [`ic-${cj.token}`]);
          assert.ok(!/desmarcado/.test(String(ic.detail || "")), `InitiateCheckout marcado foi barrado: ${ic.detail}`);
          return `pedido ${pj.orderNumber}: Purchase meta "skipped (evento desmarcado)"; InitiateCheckout ${ic.status} (${ic.detail || "sem detalhe"})`;
        }),
      );
      await restoreRow("ads.meta.events", backup["ads.meta.events"]);

      results.push(
        await L.scenario("20d", "Configuracoes > E-mail: Verificar conexao mostra Conectado", async () => {
          if (!(await portOpen(2525))) {
            sink = spawn(process.execPath, [path.join(__dirname, "_smtp-sink.cjs")], { stdio: "ignore" });
            for (let i = 0; i < 40 && !(await portOpen(2525)); i++) await sleep(150);
            assert.ok(await portOpen(2525), "coletor SMTP 127.0.0.1:2525 nao subiu");
          }
          const port = await one("select value from settings where key = 'email.smtp.port'");
          assert.ok(port && Number(port.value) === 2525, "SMTP nao aponta para o coletor (rode node e2e/_setup.cjs on)");
          await page.goto(`${L.BASE}/admin/configuracoes#email`, { waitUntil: "networkidle" });
          const btn = page.getByRole("button", { name: "Verificar conexão", exact: true });
          await btn.waitFor({ state: "visible", timeout: 10000 });
          await btn.click();
          const msg = await L.waitText(page.locator(".af-result").filter({ hasText: /Conectado|Falhou/ }), /Conectado/, 20000);
          const badge = await L.waitText(page.locator('[data-testid="email-status"]'), /^Conectado/, 15000);
          const st = await one("select value from settings where key = 'integrations.status'");
          assert.ok(st && st.value && st.value.email && st.value.email.ok === true, "integrations.status.email nao gravou ok");
          return `${msg} | selo: ${badge}`;
        }),
      );
      assert.deepEqual(pageErrors, [], `erros na pagina: ${pageErrors.join(" | ")}`);
    } finally {
      await browser.close();
    }
  } finally {
    for (const k of TOUCHED) await restoreRow(k, backup[k]);
    if (sink) sink.kill();
  }
  const bad = results.filter((r) => !r).length;
  process.stdout.write(bad ? `\n${bad} cenario(s) falharam\n` : "\nTodos os cenarios passaram\n");
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  process.stderr.write(`erro: ${String(e && e.message ? e.message : e).slice(0, 400)}\n`);
  process.exit(1);
});
