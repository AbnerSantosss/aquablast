/* eslint-disable @typescript-eslint/no-require-imports */
// 18 - Envios e prazo de postagem (etapa B do pedido 2026-09-30-rastreio-sla-pix-qr-bump-cor-pixels).
// Alvo: dev em http://localhost:3100 + banco local + coletor SMTP 127.0.0.1:2525 (e2e/_smtp-sink.cjs).
// Pre-requisito: `node e2e/_setup.cjs on` (SMTP apontado para o coletor). Se o coletor nao estiver
// ouvindo, este script sobe um e derruba no fim (so o que ele mesmo subiu).
// Rodar: NODE_PATH="$(npm root -g)" node e2e/18-envios-sla.cjs
//
// Cria um pedido proprio (E2E-SLA-<stamp>, pago ha 4 dias, sem rastreio) e confere:
//  1. /admin/envios (1366x768): linha do pedido com selo "atrasado", badge vermelho no menu, pagina cabe na janela;
//     Inicio com a faixa "passaram do prazo de postagem"; celular 390 sem rolagem lateral.
//  2. /api/cron/reminders (CRON_SECRET do .env, sem imprimir) -> 1 e-mail ao admin; 2a chamada nao repete.
//  3. "Salvar e avisar cliente" na aba -> e-mail shipped com link ABSOLUTO de /rastrear e pedido sai de Pendentes.
// No fim apaga o pedido, os e-mails do email_log dele e devolve as settings que mexeu.
const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const L = require("./_lib.cjs");
const { loadEnv } = require("./_env.cjs");
const { assert, withDb } = L;

const STAMP = Date.now().toString(36).toUpperCase();
const ORDER_NUMBER = `E2E-SLA-${STAMP}`;
const CUSTOMER_EMAIL = `sla-cliente-${STAMP.toLowerCase()}@teste.test`;
const ADMIN_EMAIL = `sla-admin-${STAMP.toLowerCase()}@teste.test`;
const TRACKING = `QB${STAMP}BR`;
const MAIL = path.join(__dirname, "out", "mail");
const one = async (sql, args) => (await withDb((c) => c.query(sql, args))).rows[0];
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function decodeQP(t) {
  return t.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function mailsTo(addr) {
  if (!fs.existsSync(MAIL)) return [];
  const re = new RegExp(`^X-Sink-To: .*${addr.replace(/[.+]/g, "\\$&")}`, "mi");
  return fs
    .readdirSync(MAIL)
    .filter((f) => f.endsWith(".eml"))
    .map((f) => fs.readFileSync(path.join(MAIL, f), "utf8"))
    .filter((t) => re.test(t))
    .map((t) => Buffer.from(decodeQP(t), "latin1").toString("utf8"));
}
function cronHeaders() {
  const secret = process.env.CRON_SECRET || loadEnv().CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET ausente no .env");
  return { authorization: `Bearer ${secret}` };
}
async function cronReminders() {
  const r = await fetch(`${L.BASE}/api/cron/reminders`, { headers: cronHeaders() });
  assert.equal(r.status, 200, `cron reminders -> ${r.status}`);
  return r.json();
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
async function fitsWindow(page) {
  return page.evaluate(() => ({
    vh: window.innerHeight,
    doc: document.scrollingElement.scrollHeight,
    hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
}

async function saveSettingRow(key) {
  return (await withDb((c) => c.query("select value, encrypted, updated_by from settings where key = $1", [key]))).rows[0] || null;
}
async function restoreSettingRow(key, row) {
  if (!row) return withDb((c) => c.query("delete from settings where key = $1", [key]));
  return withDb((c) =>
    c.query("update settings set value = $2::jsonb, encrypted = $3, updated_by = $4, updated_at = now() where key = $1", [key, JSON.stringify(row.value), row.encrypted, row.updated_by]),
  );
}

(async () => {
  let sink = null;
  let orderId = null;
  const prev = { admin: await saveSettingRow("alerts.adminEmail"), sla: await saveSettingRow("orders.slaDays") };
  try {
    await L.scenario("18", "Envios e prazo de postagem (selo, badge, alerta ao admin, e-mail shipped)", async () => {
      if (!(await portOpen(2525))) {
        sink = spawn(process.execPath, [path.join(__dirname, "_smtp-sink.cjs")], { stdio: "ignore" });
        for (let i = 0; i < 40 && !(await portOpen(2525)); i++) await sleep(150);
        assert.ok(await portOpen(2525), "coletor SMTP 127.0.0.1:2525 nao subiu");
      }
      const smtp = await one("select value from settings where key = 'email.smtp.port'");
      assert.ok(smtp && Number(smtp.value) === 2525, "SMTP nao aponta para o coletor (rode node e2e/_setup.cjs on)");

      await L.setSetting("orders.slaDays", 3);
      await L.setSetting("alerts.adminEmail", ADMIN_EMAIL);
      const items = [{ name: "AquaBlast", sku: "AQB-UNIT", variant: "Azul", quantity: 1, unitPrice: 129.9 }];
      const o = await one(
        `insert into orders (order_number, checkout_provider, status, payment_status, payment_method, customer_name, customer_email, items, amount_total, paid_at, created_at, updated_at)
         values ($1, 'manual', 'approved', 'paid', 'pix', 'Cliente Prazo E2E', $2, $3::jsonb, 129.90, now() - interval '4 days', now() - interval '4 days', now()) returning id`,
        [ORDER_NUMBER, CUSTOMER_EMAIL, JSON.stringify(items)],
      );
      orderId = o.id;
      const notes = [];

      // 1. Painel em 1366x768: selo, badge, cabe na janela; Inicio com a faixa.
      const { browser, page, pageErrors } = await L.open({ width: 1366, height: 768, consent: null });
      try {
        await login(page);
        // Lista de templates roda ensureDefaultTemplates (atualiza o "Pedido enviado" nao editado com o link da transportadora).
        await page.goto(`${L.BASE}/admin/emails/templates`, { waitUntil: "networkidle" });

        await page.goto(`${L.BASE}/admin/envios`, { waitUntil: "networkidle" });
        const row = page.locator(`tr[data-order="${ORDER_NUMBER}"]`);
        await row.waitFor({ state: "visible", timeout: 15000 });
        assert.equal(await row.locator("[data-sla]").getAttribute("data-sla"), "atrasado", "selo do pedido nao esta atrasado");
        const selo = ((await row.locator("[data-sla]").textContent()) || "").trim();
        assert.match(selo, /Atrasado 1 dia/, `texto do selo: ${selo}`);
        assert.match((await row.textContent()) || "", /Azul/, "cor/itens ausente na linha");
        const badge = page.locator('.nav-link[href="/admin/envios"] .nav-badge');
        await badge.waitFor({ state: "visible", timeout: 5000 });
        const badgeN = Number(((await badge.textContent()) || "").replace(/\D/g, ""));
        assert.ok(badgeN >= 1, `badge do menu: ${badgeN}`);
        const bg = await badge.evaluate((el) => getComputedStyle(el).backgroundColor);
        assert.equal(bg, "rgb(166, 27, 18)", `badge nao usa --danger: ${bg}`);
        const fit = await fitsWindow(page);
        assert.ok(fit.doc <= fit.vh, `/admin/envios em 1366x768 rola a pagina: doc ${fit.doc} > janela ${fit.vh}`);
        assert.ok(fit.hscroll <= 0, `/admin/envios com rolagem lateral de ${fit.hscroll}px`);
        await L.shot(page, "18-envios-1366", false);
        notes.push(`envios 1366x768 doc ${fit.doc}/${fit.vh}, badge ${badgeN}`);

        await page.goto(`${L.BASE}/admin`, { waitUntil: "networkidle" });
        await L.waitText(page.locator(".flash.is-err", { hasText: "prazo de postagem" }), /passaram do prazo de postagem/);
        const homeRow = page.locator("tr", { hasText: ORDER_NUMBER });
        if ((await homeRow.count()) > 0) assert.equal(await homeRow.first().locator("[data-sla]").getAttribute("data-sla"), "atrasado", "selo no Inicio");
        else notes.push("Inicio: pedido fora dos 5 mais antigos");
        await L.shot(page, "18-inicio-1366", false);
        assert.deepEqual(pageErrors, [], "erro de JS no painel");
      } finally {
        await browser.close();
      }

      // Celular 390: cartao por linha, sem rolagem lateral.
      const m = await L.open({ width: 390, height: 844, mobile: true, consent: null });
      try {
        await login(m.page);
        await m.page.goto(`${L.BASE}/admin/envios`, { waitUntil: "networkidle" });
        await m.page.locator(`tr[data-order="${ORDER_NUMBER}"]`).waitFor({ state: "visible", timeout: 15000 });
        await L.noHorizontalScroll(m.page);
        await L.shot(m.page, "18-envios-390", true);
      } finally {
        await m.browser.close();
      }

      // 2. Cron: um alerta ao admin, sem repetir.
      const before = mailsTo(ADMIN_EMAIL).length;
      assert.equal(before, 0, "ja havia e-mail para o admin de teste");
      const r1 = await cronReminders();
      assert.ok(r1.sla && !r1.sla.error, `cron sem resultado sla: ${JSON.stringify(r1.sla)}`);
      assert.ok(r1.sla.sent >= 1, `cron nao enviou alerta: ${JSON.stringify(r1.sla)}`);
      await sleep(1500);
      // O cron avisa TODO pedido pago sem rastreio que passou do prazo, um e-mail por pedido. O banco de dev acumula
      // pedidos pagos de execucoes anteriores da bateria; quando eles vencem (orders.slaDays = 3 aqui), o admin de
      // teste recebe tambem os alertas deles. Por isso a contagem e por pedido: exatamente 1 alerta DESTE pedido,
      // e o total tem de bater com o que o cron disse que enviou (nenhum e-mail a mais, nenhum a menos).
      const adminMails = mailsTo(ADMIN_EMAIL);
      assert.equal(adminMails.length, r1.sla.sent, `e-mails ao admin apos 1a chamada: ${adminMails.length}, cron disse ${r1.sla.sent}`);
      const mine = adminMails.filter((t) => t.includes(ORDER_NUMBER));
      assert.equal(mine.length, 1, `alertas deste pedido apos a 1a chamada: ${mine.length}`);
      if (adminMails.length > 1) notes.push(`cron avisou tambem ${adminMails.length - 1} pedido(s) antigo(s) do banco de dev`);
      assert.match(mine[0], new RegExp(`href="https?://[^"]+/admin/pedidos/${orderId}"`), "alerta sem link absoluto para /admin/pedidos/<id>");
      assert.match(mine[0], /Cliente Prazo E2E/, "alerta sem o cliente");
      const alerted = await one("select sla_alerted_at from orders where id = $1", [orderId]);
      assert.ok(alerted.sla_alerted_at, "sla_alerted_at nao gravado");
      const r2 = await cronReminders();
      await sleep(1500);
      const after2 = mailsTo(ADMIN_EMAIL);
      assert.equal(after2.filter((t) => t.includes(ORDER_NUMBER)).length, 1, "alerta deste pedido repetido na 2a chamada do cron");
      // Sem repeticao para ninguem: a 2a chamada so pode somar o que ela mesma declarou (pedido que venceu entre as duas).
      assert.equal(after2.length, adminMails.length + ((r2.sla && r2.sla.sent) || 0), "2a chamada do cron mandou e-mail ao admin sem declarar");

      // 3. Salvar codigo pela aba -> e-mail shipped com link absoluto; pedido sai de Pendentes.
      const b = await L.open({ width: 1366, height: 768, consent: null });
      try {
        await login(b.page);
        await b.page.goto(`${L.BASE}/admin/envios`, { waitUntil: "networkidle" });
        const row = b.page.locator(`tr[data-order="${ORDER_NUMBER}"]`);
        await row.locator('input[name="trackingCode"]').fill(TRACKING.toLowerCase());
        await row.locator('select[name="carrierCode"]').selectOption("2151");
        await row.getByRole("button", { name: "Salvar e avisar cliente" }).click();
        const fb = await L.waitText(b.page.locator("[data-ship-feedback]"), /Rastreio salvo/, 30000);
        assert.match(fb, new RegExp(`e-mail enviado para ${CUSTOMER_EMAIL.replace(/[.+]/g, "\\$&")}`), `feedback: ${fb}`);
        await b.page.locator(`tr[data-order="${ORDER_NUMBER}"]`).waitFor({ state: "detached", timeout: 15000 });
        await L.shot(b.page, "18-envios-salvo", false);
        await b.page.goto(`${L.BASE}/admin/envios?aba=enviados`, { waitUntil: "networkidle" });
        const sent = b.page.locator(`tr[data-order="${ORDER_NUMBER}"]`);
        await sent.waitFor({ state: "visible", timeout: 15000 });
        assert.match((await sent.textContent()) || "", new RegExp(TRACKING), "codigo nao aparece em Enviados");
        assert.match((await sent.textContent()) || "", /Correios/, "transportadora nao aparece em Enviados");
        assert.deepEqual(b.pageErrors, [], "erro de JS ao salvar");
      } finally {
        await b.browser.close();
      }
      const db = await one("select status, tracking_code, carrier_name from orders where id = $1", [orderId]);
      assert.equal(db.tracking_code, TRACKING, "codigo nao gravado em maiusculas");
      assert.equal(db.status, "shipped", `status apos salvar: ${db.status}`);
      await sleep(1500);
      const shipped = mailsTo(CUSTOMER_EMAIL);
      assert.equal(shipped.length, 1, `e-mails ao cliente: ${shipped.length}`);
      assert.match(shipped[0], /foi[_ ]enviado/, "e-mail ao cliente nao e o de envio");
      assert.match(shipped[0], /href="https?:\/\/[^"/]+\/rastrear\?codigo=[^"]+"/, "link de rastreio nao e absoluto");
      // Desde o c371643 (2026-10-02) o e-mail leva o codigo de rastreio do CLIENTE (BR + 13 digitos, {{codigo_acesso}}),
      // o mesmo do link /rastrear?codigo=; o codigo da transportadora (TRACKING) so entra se o template usar {{codigo_transportadora}}.
      assert.match(shipped[0], /Seu código de rastreio[\s\S]*?BR\d{13}/, "e-mail sem o codigo de rastreio do cliente (BR + 13 digitos)");
      assert.match(shipped[0], /\/rastrear\?codigo=BR\d{13}"/, "link do e-mail sem o codigo BR + 13 digitos");
      const carrierLink = shipped[0].includes("rastreamento.correios.com.br");
      const tpl = await one("select body_html like '%link_transportadora%' as has from email_templates where key = 'shipped'");
      if (tpl && tpl.has) assert.ok(carrierLink, "template com link da transportadora, mas o e-mail saiu sem");
      notes.push(carrierLink ? "e-mail shipped com link absoluto + link dos Correios" : "e-mail shipped com link absoluto (template editado sem link da transportadora)");
      return notes.join("; ");
    });
  } finally {
    if (orderId) {
      await withDb((c) => c.query("delete from email_log where order_id = $1 or \"to\" in ($2, $3)", [orderId, ADMIN_EMAIL, CUSTOMER_EMAIL]));
      await withDb((c) => c.query("delete from orders where id = $1", [orderId]));
    }
    await restoreSettingRow("alerts.adminEmail", prev.admin);
    await restoreSettingRow("orders.slaDays", prev.sla);
    if (sink) sink.kill();
  }
})();
