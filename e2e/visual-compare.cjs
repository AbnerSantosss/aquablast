/* eslint-disable @typescript-eslint/no-require-imports */
// Fase 14.3: comparacao visual ORIGEM (aquablast-checkout na porta 3210) x checkout proprio (3100), em 1440, 760 e 412.
// Para cada estado do fluxo grava as duas capturas lado a lado em e2e/out/visual/ e um relatorio com:
//  - classes CSS que existem so de um lado;
//  - linhas de texto visiveis que existem so de um lado (numeros, precos, datas e cores normalizados, pois sao permitidos);
//  - caixas (x, y, largura, altura) dos blocos principais com diferenca maior que 6px.
// Rodar: NODE_PATH="$(npm root -g)" node e2e/visual-compare.cjs
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const L = require("./_lib.cjs");

const ORIGEM = process.env.E2E_ORIGEM || "http://localhost:3210";
const OUT = path.join(__dirname, "out", "visual");
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.VC_ONLY;
const WIDTHS_ALL = [
  { width: 1440, height: 900, tag: "1440", mobile: false },
  { width: 760, height: 1000, tag: "760", mobile: false },
  { width: 412, height: 915, tag: "412", mobile: true },
];
const WIDTHS = ONLY ? WIDTHS_ALL.filter((w) => w.tag === ONLY) : WIDTHS_ALL;
const BLOCKS = [".ship-bar", ".ck-top", ".campaign", ".ck-flow", ".order-summary", ".trust-seals", ".ck-footer", ".ck-steps", ".pay-acc", ".order-bump", ".ck-pix", ".ck-success", ".ck-cardform"];

async function openSide(side, v) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, isMobile: v.mobile, hasTouch: v.mobile, locale: "pt-BR" });
  // Mesmo instante nos dois lados (o cronometro depende da hora).
  await context.clock.install({ time: new Date("2026-09-27T12:00:00-03:00") });
  if (side === "nosso") await context.addInitScript(() => { try { window.localStorage.setItem("ck-consent", "declined"); } catch {} });
  const page = await context.newPage();
  await page.route("https://viacep.com.br/**", (r) =>
    r.fulfill({ json: { cep: "01310-200", logradouro: L.endereco.street, complemento: "", bairro: L.endereco.district, localidade: L.endereco.city, uf: L.endereco.state } }),
  );
  const url = side === "origem" ? `${ORIGEM}/signin-with-chatgpt?return_to=/?product=single` : `${L.BASE}/checkout?pack=unit&cor=azul`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator(".ck-flow").waitFor();
  await page.waitForFunction(() => { const b = document.querySelector(".ck-flow button[type=submit]"); return b && !b.disabled; }, null, { timeout: 15000 });
  await page.clock.runFor(1500);
  return { browser, page };
}

const norm = (t) =>
  t
    .replace(/\d{2}d \d{2}:\d{2}:\d{2}/g, "<tempo>")
    .replace(/R\$\s?[\d.]+,\d{2}/g, "R$ <valor>")
    .replace(/\b\d{1,2}x\b/g, "<n>x")
    .replace(/(TESTE|AQB)-[\w-]+/g, "<pedido>")
    .replace(/SIMULADO-[\w-]+|[0-9a-f]{20,}/gi, "<codigo>")
    .replace(/\b(azul|preta|preto|vermelha|vermelho|verde|rosa|amarela|branca|roxa)\b/gi, "<cor>")
    .replace(/\d{2}:\d{2}/g, "<mm:ss>")
    .replace(/\d+ (minutos|segundos)/g, "<validade>")
    .trim();

async function snapshot(page) {
  return page.evaluate((blocks) => {
    const root = document.querySelector(".ck");
    const classes = new Set();
    for (const el of root.querySelectorAll("[class]")) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      for (const c of String(el.getAttribute("class")).split(/\s+/)) if (c && !/^(lucide|ck-root|size-|data-)/.test(c) && !c.includes("[")) classes.add(c);
    }
    const lines = root.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
    const boxes = {};
    for (const sel of blocks) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      boxes[sel] = { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    }
    return { classes: [...classes].sort(), lines, boxes, scrollW: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  }, BLOCKS);
}

function diff(a, b) {
  const onlyA = (x, y) => x.filter((i) => !y.includes(i));
  const la = a.lines.map(norm), lb = b.lines.map(norm);
  const boxes = [];
  for (const sel of new Set([...Object.keys(a.boxes), ...Object.keys(b.boxes)])) {
    const p = a.boxes[sel], q = b.boxes[sel];
    if (!p || !q) { boxes.push(`${sel}: ${p ? "so na origem" : "so no nosso"}`); continue; }
    const d = ["x", "y", "w", "h"].filter((k) => Math.abs(p[k] - q[k]) > 6).map((k) => `${k} ${p[k]}→${q[k]}`);
    if (d.length) boxes.push(`${sel}: ${d.join(", ")}`);
  }
  return {
    classesSoOrigem: onlyA(a.classes, b.classes),
    classesSoNosso: onlyA(b.classes, a.classes),
    textoSoOrigem: [...new Set(onlyA(la, lb))],
    textoSoNosso: [...new Set(onlyA(lb, la))],
    caixas: boxes,
    rolagemHorizontal: { origem: a.scrollW, nosso: b.scrollW },
  };
}

// Passos do fluxo, iguais nos dois lados (mesmos `name` de campo e textos de botao da origem).
const STEPS = [
  ["1-dados-vazio", async () => {}],
  ["1-dados-preenchido", async (p) => {
    await p.locator("[name=name]").fill(L.cliente.name);
    await p.locator("[name=email]").fill(L.cliente.email);
    await p.locator("[name=phone]").fill(L.cliente.phone);
    await p.locator("[name=cpf]").fill(L.cliente.cpf);
  }],
  ["2-entrega-vazia", async (p) => {
    await p.getByRole("button", { name: "CONTINUAR", exact: true }).click();
    await p.locator("[name=cep]").waitFor();
  }],
  ["2-entrega-confirmada", async (p) => {
    await p.locator("[name=cep]").fill(L.endereco.cep);
    await p.waitForFunction(() => document.querySelector(".cep-city")?.textContent?.includes("São Paulo/SP"), null, { timeout: 10000 });
    await p.locator("[name=number]").fill(L.endereco.number);
    await p.getByRole("button", { name: "CONFIRMAR ENDEREÇO", exact: true }).click();
    await p.locator(".ship-options").waitFor();
  }],
  ["3-pagamento-pix", async (p) => {
    await p.getByRole("button", { name: "CONTINUAR", exact: true }).click();
    await p.locator(".pay-acc").waitFor({ timeout: 10000 });
    // A origem abre no Pix; o nosso abre no cartao desde 2026-09-28. Escolhe o Pix nos dois lados para comparar igual.
    await p.locator(".pay-head", { hasText: "Pix" }).first().click();
  }],
  ["3-pagamento-cartao", async (p) => {
    await p.locator(".pay-head", { hasText: "Cartão de crédito" }).click();
    await p.locator("[name=cc-number]").waitFor();
  }],
  ["3-bump-pix", async (p) => {
    await p.locator(".pay-head", { hasText: "Pix" }).click();
    await p.locator(".bump-choice").click();
    await p.locator(".bump-choice", { hasText: "ADICIONADO AO PEDIDO" }).waitFor();
  }],
  ["4-pix-gerado", async (p) => {
    await p.locator(".ck-pix-start .ck-pay-btn").click();
    await p.locator("[name=pix-code]").waitFor({ timeout: 15000 });
  }],
  ["5-sucesso", async (p) => {
    await p.getByRole("button", { name: "Simular pagamento aprovado" }).click();
    await p.locator(".ck-success").waitFor({ timeout: 20000 });
  }],
];

(async () => {
  const report = {};
  for (const v of WIDTHS) {
    const o = await openSide("origem", v);
    const n = await openSide("nosso", v);
    try {
      for (const [name, act] of STEPS) {
        const id = `${v.tag}-${name}`;
        try {
          await act(o.page).catch(async (e) => { await o.page.screenshot({ path: path.join(OUT, `${id}-origem-ERRO.png`), fullPage: true }); throw new Error(`origem: ${e.message}`); });
          await act(n.page).catch(async (e) => { await n.page.screenshot({ path: path.join(OUT, `${id}-nosso-ERRO.png`), fullPage: true }); throw new Error(`nosso: ${e.message}`); });
          await o.page.clock.runFor(800);
          await n.page.clock.runFor(800);
          await o.page.mouse.move(0, 0);
          await n.page.mouse.move(0, 0);
          const [a, b] = [await snapshot(o.page), await snapshot(n.page)];
          report[id] = diff(a, b);
          await o.page.screenshot({ path: path.join(OUT, `${id}-origem.png`), fullPage: true });
          await n.page.screenshot({ path: path.join(OUT, `${id}-nosso.png`), fullPage: true });
          process.stdout.write(`ok ${id}\n`);
        } catch (e) {
          report[id] = { erro: String(e.message).split("\n")[0].slice(0, 300) };
          process.stdout.write(`ERRO ${id}: ${report[id].erro}\n`);
          break;
        }
      }
    } finally {
      await o.browser.close();
      await n.browser.close();
    }
  }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  process.stdout.write(`relatorio: ${path.join(OUT, "report.json")}\n`);
})();
