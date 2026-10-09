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
  await submitCurrentForm(page);
  await field(page, "cep").waitFor({ timeout: 10000 });
}

/** A ação principal da etapa, sem depender do texto personalizado no painel. */
async function submitCurrentForm(page) {
  const submit = page.locator('.ck-step[aria-current="step"] form button[type="submit"]');
  assert.equal(await submit.count(), 1, "deveria haver uma ação de envio no formulário atual");
  await submit.click();
}

/**
 * Campo da entrega pelo `name`. Desde o checkout de 2026-10-07 (49f7d26) complemento e destinatário ficam
 * sempre na tela depois do CEP (antes abriam por um botão em .delivery-optional / .delivery-recipient-summary).
 */
async function revealEntregaField(page, name) {
  const input = field(page, name);
  await input.waitFor({ state: "visible", timeout: 5000 });
  return input;
}

/** O resumo fica recolhido no celular; a conferência detalhada abre o mesmo controle do cliente. */
async function revealSummary(page) {
  const toggle = page.locator(".ck-summary-toggle");
  if (await toggle.isVisible() && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  await page.locator(".ck-summary-details").waitFor({ state: "visible", timeout: 5000 });
}

// ---- Resumo do pedido ainda não pago (OrderSummary, 49f7d26) ----
// As classes do resumo viraram CSS Modules; o que é estável: .order-summary, .ck-summary-details, o <dl> de
// valores (dt/dd) e os atributos data-summary-*. O resumo do pedido PAGO continua com as classes antigas.
const summary = (page) => page.locator(".order-summary .ck-summary-details");
const summaryRowBy = (page, re) => summary(page).locator("dl > div").filter({ has: page.locator("dt", { hasText: re }) }).locator("dd");
/** Valor (<dd>) da linha do resumo cujo rótulo (<dt>) é exatamente `label`: "Produtos", "Desconto no Pix", "Entrega"… */
const summaryRow = (page, label) => summaryRowBy(page, new RegExp("^\\s*" + String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$"));
/** Linha do total: `method` "pix" | "card" exige o rótulo daquela forma; sem ele aceita o total em destaque. */
const summaryTotal = (page, method) =>
  method ? summaryRow(page, method === "card" ? "Total no cartão" : "Total no Pix") : summaryRowBy(page, /^\s*Total no (Pix|cartão)\s*$/);
/** Frase abaixo dos valores (parcelamento ou alternativa no Pix), localizada pelo texto. */
const summaryNote = (page, re) => summary(page).locator("p").filter({ hasText: re });
/** Produto n (1 ou 2) da lista "Produtos e cores escolhidas". */
const summaryUnit = (page, n) => summary(page).locator(`[data-summary-unit="${n}"]`);
/** Linha da 2ª unidade vinda do order bump: data-summary-bump = "pending" (sem cor) | "confirmed". */
const summaryBump = (page) => summary(page).locator("[data-summary-bump]");
/** Confere produto n do resumo: cor (atributo e texto) e foto com alt da cor. */
async function expectSummaryUnit(page, n, color, { kit = false } = {}) {
  const unit = summaryUnit(page, n);
  await unit.waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await unit.getAttribute("data-summary-color"), color, `${n}ª unidade do resumo deveria ser ${color}`);
  await waitText(unit, new RegExp("AquaBlast\\s*" + (kit ? `${n}ª unidade · ` : "Cor: ") + color + "\\s*Qtd\\. 1", "i"));
  assert.equal(await unit.locator("img").getAttribute("alt"), `AquaBlast ${color}`, `foto da ${n}ª unidade`);
}

/**
 * Botão "Editar …" do cartão da etapa concluída (.ck-edit). A barra de progresso (nav.ck-progress) tem um botão
 * com o mesmo nome acessível; por isso o papel+nome sozinho não é mais único.
 */
const editStep = (page, name) => page.locator(".ck-steps").getByRole("button", { name, exact: true });
const progressEdit = (page, name) => page.locator("nav.ck-progress").getByRole("button", { name, exact: true });

// ---- Pix gerado na etapa 3 (PixPay, 49f7d26): .pix-validity e .pix-code-area saíram ----
/** Contagem compacta do Pix ("10:00"). */
const pixCountdown = (page) => page.locator('[data-pix-countdown]');
/** Botão "Copiar código Pix" / "Código copiado". */
const pixCopy = (page) => page.locator("[data-pix-copy]");

async function fillEntrega(page, { manual = false, extra, recipient } = {}) {
  await field(page, "cep").fill(endereco.cep);
  await field(page, "street").waitFor({ state: "visible", timeout: 10000 });
  if (!manual) {
    await page.waitForFunction(() => document.querySelector(".cep-city")?.textContent?.includes("São Paulo/SP"), null, { timeout: 10000 });
    assert.equal(await field(page, "street").inputValue(), endereco.street);
    assert.equal(await field(page, "district").inputValue(), endereco.district);
  } else {
    await page.locator(".cep-manual").waitFor({ state: "visible", timeout: 10000 });
    await field(page, "street").fill(endereco.street);
    await field(page, "district").fill(endereco.district);
    await field(page, "city").fill(endereco.city);
    await field(page, "state").selectOption(endereco.state);
  }
  await field(page, "number").fill(endereco.number);
  if (extra !== undefined) await (await revealEntregaField(page, "extra")).fill(extra);
  const rec = field(page, "recipient");
  if (recipient !== undefined) await (await revealEntregaField(page, "recipient")).fill(recipient);
  else {
    // O destinatário vem preenchido com o nome informado na etapa 1 (antes aparecia em .delivery-recipient-summary).
    await rec.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await rec.inputValue(), cliente.name, "destinatário deveria vir dos dados do cliente");
  }
}

async function submitEntrega(page) {
  await waitText(page.locator(".ship-opt"), /Frete FULL.*Entrega com rastreamento/);
  await submitCurrentForm(page);
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

/**
 * Cabecalho de uma forma de pagamento na etapa 3, pelo value do radio ("pix" | "card"): nao depende do texto,
 * que pode mencionar a outra forma. Pix abre primeiro quando disponível; choosePix também cobre a troca de cartão.
 */
const payHead = (page, method) => page.locator(".pay-head").filter({ has: page.locator(`input[value="${method}"]`) });

async function choosePix(page) {
  await payHead(page, "pix").click();
  await page.locator('.pay-item.is-open input[value="pix"]').waitFor({ timeout: 10000 });
}

// Mesma chave de TOKEN_KEY em src/components/checkout/Checkout.tsx (trocada para -unit-149 em 2026-10-08, para
// descartar carrinhos antigos com o preco anterior). Se a chave mudar la, mudar aqui, senao "carrinho nao nasceu".
async function cartTokenOf(page) {
  return page.evaluate(() => { try { return window.localStorage.getItem("ck-cart-token-unit-149"); } catch { return null; } });
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
  fillDados, submitDados, fillEntrega, submitEntrega, submitCurrentForm, revealEntregaField, revealSummary, goCheckout, toPayment, cartTokenOf, payHead, choosePix,
  summary, summaryRow, summaryTotal, summaryNote, summaryUnit, summaryBump, expectSummaryUnit, editStep, progressEdit, pixCountdown, pixCopy,
  clearRateLimits, setSetting, deleteSetting, scenario,
};
