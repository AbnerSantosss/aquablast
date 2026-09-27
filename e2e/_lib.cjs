/* eslint-disable @typescript-eslint/no-require-imports */
// Utilitarios comuns dos testes e2e do checkout proprio (fase 14.4).
// Rodar com: NODE_PATH="$(npm root -g)" node e2e/<arquivo>.cjs   (Playwright instalado globalmente,
// nao entra no package.json). Alvo: dev server em http://localhost:3100 (nunca e reiniciado aqui).
// Dados de teste ficticios (CPF valido so pelo digito verificador). Nenhum cartao real.
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { chromium } = require("playwright");
const { withDb } = require("./_db.cjs");

const BASE = process.env.E2E_BASE || "http://localhost:3100";
const OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

const cliente = { name: "Maria Teste Silva", email: "maria@teste.test", phone: "11987654321", cpf: "52998224725" };
const endereco = { cep: "01310200", street: "Avenida Paulista", number: "1000", district: "Bela Vista", city: "São Paulo", state: "SP" };
// Cartoes de teste publicos do gateway simulado (nunca cartao real). Nao sao impressos nem gravados.
const CARD_OK = ["4242", "4242", "4242", "4242"].join("");
const CARD_REFUSED = ["4000", "0000", "0000", "0002"].join("");
const CARD_BAD_LUHN = ["4242", "4242", "4242", "4241"].join("");

const TRACKERS = /googletagmanager|google-analytics|facebook\.net|facebook\.com|doubleclick|analytics\.google/;

async function clearRateLimits() {
  await withDb((c) => c.query("delete from rate_limits where key like 'ck:%'"));
}

async function setSetting(key, value) {
  await withDb((c) =>
    c.query(
      "insert into settings(key, value, encrypted, updated_at, updated_by) values ($1, $2::jsonb, false, now(), 'e2e') on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = 'e2e'",
      [key, JSON.stringify(value)],
    ),
  );
}

async function deleteSetting(key) {
  await withDb((c) => c.query("delete from settings where key = $1 and updated_by = 'e2e'", [key]));
}

/**
 * Abre navegador + contexto com gravador de rede. `viacep`: "ok" (responde Av. Paulista) | "erro".
 * `consent`: "accepted" | "declined" | null (null = banner aparece e fica sem resposta).
 */
async function open({ width = 1440, height = 900, viacep = "ok", consent = "declined", mobile = false } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: "pt-BR",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  if (consent) await context.addInitScript((v) => { try { window.localStorage.setItem("ck-consent", v); } catch {} }, consent);
  const page = await context.newPage();
  const requests = [];
  page.on("request", (r) => requests.push({ url: r.url(), method: r.method(), post: r.postData() || "" }));
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 200)));
  await page.route("https://viacep.com.br/**", (r) =>
    r.fulfill({
      json:
        viacep === "erro"
          ? { erro: true }
          : { cep: "01310-200", logradouro: endereco.street, complemento: "", bairro: endereco.district, localidade: endereco.city, uf: endereco.state },
    }),
  );
  return { browser, context, page, requests, pageErrors };
}

/** Verificacoes de seguranca herdadas da origem (14.4): cartao so em /api/checkout/pay; fora do dominio so ViaCEP. */
function checkNetwork(requests) {
  const cards = [CARD_OK, CARD_REFUSED, CARD_BAD_LUHN];
  const leaked = requests.filter((r) => cards.some((n) => (r.url + r.post).includes(n)) && !r.url.startsWith(`${BASE}/api/checkout/pay`));
  assert.deepEqual(leaked.map((r) => r.url), [], "numero de cartao em requisicao que nao e /api/checkout/pay");
  const external = requests.filter((r) => {
    const u = new URL(r.url);
    return u.protocol.startsWith("http") && !["localhost", "127.0.0.1"].includes(u.hostname);
  });
  const notViacep = external.filter((r) => new URL(r.url).hostname !== "viacep.com.br");
  assert.deepEqual(notViacep.map((r) => r.url), [], "chamada externa que nao e ViaCEP");
  const badViacep = external.filter((r) => !/^\/ws\/\d{8}\/json\/$/.test(new URL(r.url).pathname) || r.method !== "GET" || r.post);
  assert.deepEqual(badViacep.map((r) => r.url), [], "ViaCEP fora do formato GET /ws/<cep>/json/");
  const trackers = requests.filter((r) => TRACKERS.test(r.url));
  assert.deepEqual(trackers.map((r) => r.url), [], "script/pixel de rastreamento carregado no checkout");
}

async function noHorizontalScroll(page) {
  const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(d <= 0, `rolagem horizontal de ${d}px`);
}

const shot = (page, name, fullPage = true) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
// Campos pelo `name` (mesmo da origem: name, email, phone, cpf, cep, street, number, extra, district, city, state, recipient, cc-*).
const field = (page, name) => page.locator(`[name="${name}"]`);
const btn = (page, name) => page.getByRole("button", { name, exact: true });

async function waitText(locator, re, timeout = 10000) {
  await locator.first().waitFor({ state: "visible", timeout });
  const deadline = Date.now() + timeout;
  let last = "";
  while (Date.now() < deadline) {
    last = ((await locator.first().textContent()) || "").replace(/\s+/g, " ").trim();
    if (re instanceof RegExp ? re.test(last) : last.includes(re)) return last;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`texto esperado ${re} nao apareceu; ultimo: "${last.slice(0, 160)}"`);
}

async function fillDados(page, c = cliente) {
  await field(page, "name").fill(c.name);
  await field(page, "email").fill(c.email);
  await field(page, "email").blur();
  await field(page, "phone").fill(c.phone);
  await field(page, "cpf").fill(c.cpf);
  assert.equal(await field(page, "phone").inputValue(), "(11) 98765-4321");
  assert.equal(await field(page, "cpf").inputValue(), "529.982.247-25");
}

async function submitDados(page) {
  await btn(page, "CONTINUAR").click();
  await field(page, "cep").waitFor({ timeout: 10000 });
}

async function fillEntrega(page, { manual = false } = {}) {
  await field(page, "cep").fill(endereco.cep);
  if (!manual) {
    await page.waitForFunction(() => document.querySelector(".cep-city")?.textContent?.includes("São Paulo/SP"), null, { timeout: 10000 });
    assert.equal(await field(page, "street").inputValue(), endereco.street);
    assert.equal(await field(page, "district").inputValue(), endereco.district);
  }
  await field(page, "number").fill(endereco.number);
  const rec = field(page, "recipient");
  if (!(await rec.inputValue())) await rec.fill(cliente.name);
}

async function submitEntrega(page) {
  await btn(page, "CONFIRMAR ENDEREÇO").click();
  await page.locator(".ship-options").waitFor({ timeout: 10000 });
  await btn(page, "CONTINUAR").click();
  await page.locator(".pay-acc").waitFor({ timeout: 10000 });
}

async function goCheckout(page, query = "pack=unit&cor=azul") {
  const res = await page.goto(`${BASE}/checkout?${query}`, { waitUntil: "networkidle" });
  assert.equal(res.status(), 200, `GET /checkout?${query} -> ${res.status()}`);
  await page.locator(".ck-flow").waitFor();
}

async function toPayment(page, query) {
  await goCheckout(page, query);
  await fillDados(page);
  await submitDados(page);
  await fillEntrega(page);
  await submitEntrega(page);
}

async function cartTokenOf(page) {
  return page.evaluate(() => { try { return window.localStorage.getItem("ck-cart-token"); } catch { return null; } });
}

/** Executa um cenario e grava o resultado em e2e/out/results.json (passou/falhou + motivo). */
async function scenario(id, title, fn) {
  const started = Date.now();
  let status = "passou";
  let detail = "";
  try {
    detail = (await fn()) || "";
  } catch (e) {
    status = "falhou";
    detail = String(e && e.message ? e.message : e).split("\n")[0].slice(0, 400);
  }
  const file = path.join(OUT, "results.json");
  let all = {};
  try { all = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  all[id] = { title, status, detail, ms: Date.now() - started, at: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(all, null, 2));
  process.stdout.write(`[${status.toUpperCase()}] ${id} ${title}${detail ? ` — ${detail}` : ""}\n`);
  return status === "passou";
}

module.exports = {
  BASE, OUT, cliente, endereco, CARD_OK, CARD_REFUSED, CARD_BAD_LUHN, assert, withDb,
  open, checkNetwork, noHorizontalScroll, shot, field, btn, waitText,
  fillDados, submitDados, fillEntrega, submitEntrega, goCheckout, toPayment, cartTokenOf,
  clearRateLimits, setSetting, deleteSetting, scenario,
};
