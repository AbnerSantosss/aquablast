/* eslint-disable @typescript-eslint/no-require-imports */
// Painel: confere se cada tela de /admin cabe na altura da janela no computador (pedido 2026-09-29-painel-100vh-desktop).
// Entra pela "Entrada rapida" (so existe em `next dev` no localhost), abre cada rota em 1366x768 e 1440x900 e mede:
//  - doc: altura rolavel da pagina x altura da janela (o que o pedido quer: doc <= janela);
//  - scrollers: areas com rolagem propria (tabelas, listas) e quanto conteudo tem dentro;
//  - blocos: os filhos do conteudo principal com a altura de cada um, para achar quem estoura.
// Grava capturas em e2e/out/painel-100vh/ e um resumo em JSON.
// Rodar: NODE_PATH="$(npm root -g)" node e2e/painel-100vh.cjs   (BASE=http://localhost:3100 por padrao; SO=pixels filtra)
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = path.join(__dirname, "out", "painel-100vh");
fs.mkdirSync(OUT, { recursive: true });
const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  ...(process.env.MOBILE ? [{ width: 390, height: 844 }] : []),
];
const ROUTES = [
  "/admin",
  "/admin/dashboard",
  "/admin/pedidos",
  "/admin/pedidos/novo",
  { from: "/admin/pedidos", link: /^\/admin\/pedidos\/(?!novo)[^/?#]+$/, name: "/admin/pedidos/[id]" },
  "/admin/carrinhos",
  "/admin/clientes",
  "/admin/produtos",
  "/admin/pixels",
  "/admin/emails",
  "/admin/emails/templates",
  { from: "/admin/emails/templates", link: /^\/admin\/emails\/templates\/[^/?#]+$/, name: "/admin/emails/templates/[key]" },
  "/admin/gateways",
  "/admin/checkout",
  "/admin/webhooks",
  { from: "/admin/webhooks", link: /^\/admin\/webhooks\/[^/?#]+$/, name: "/admin/webhooks/[id]" },
  "/admin/configuracoes",
];

async function resolve(page, r) {
  if (typeof r === "string") return { url: r, name: r };
  await page.goto(BASE + r.from, { waitUntil: "networkidle" });
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  const href = hrefs.find((h) => h && r.link.test(h));
  return href ? { url: href, name: r.name } : null;
}

function measure() {
  const vh = window.innerHeight;
  const doc = document.scrollingElement.scrollHeight;
  const main = document.querySelector("main") || document.body;
  const scrollers = [...document.querySelectorAll("*")]
    .filter((el) => {
      const cs = getComputedStyle(el);
      return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 40;
    })
    .map((el) => ({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""), client: el.clientHeight, content: el.scrollHeight }));
  const blocks = [];
  const walk = (el, depth) => {
    for (const c of el.children) {
      const r = c.getBoundingClientRect();
      if (r.height < 1) continue;
      blocks.push({ d: depth, sel: c.tagName.toLowerCase() + (typeof c.className === "string" && c.className ? "." + c.className.trim().split(/\s+/).slice(0, 3).join(".") : ""), top: Math.round(r.top + scrollY), h: Math.round(r.height) });
      if (depth < 2) walk(c, depth + 1);
    }
  };
  walk(main, 0);
  return { vh, doc, over: doc - vh, scrollers, blocks };
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: "pt-BR" });
    const page = await context.newPage();
    await page.goto(BASE + "/admin/login", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Entrada r[aá]pida/i }).click();
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30000 });
    for (const r of ROUTES) {
      if (process.env.SO && !JSON.stringify(r).includes(process.env.SO)) continue;
      const target = await resolve(page, r);
      if (!target) {
        results.push({ vp: `${vp.width}x${vp.height}`, route: r.name, skipped: "sem item na lista" });
        continue;
      }
      await page.goto(BASE + target.url, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      const m = await page.evaluate(measure);
      const file = `${target.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "inicio"}-${vp.width}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      results.push({ vp: `${vp.width}x${vp.height}`, route: target.name, ...m, shot: file });
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "resumo.json"), JSON.stringify(results, null, 2));
  for (const r of results) {
    if (r.skipped) {
      process.stdout.write(`${r.vp}  ${r.route}  PULADA (${r.skipped})\n`);
      continue;
    }
    const flag = r.over > 0 ? `ESTOURA +${r.over}px` : "cabe";
    const sc = r.scrollers.filter((s) => !/^html|^body/.test(s.sel)).map((s) => `${s.sel.slice(0, 40)} ${s.client}/${s.content}`).join("; ");
    process.stdout.write(`${r.vp}  ${r.route.padEnd(32)} doc ${String(r.doc).padStart(5)} / ${r.vh}  ${flag}${sc ? "  | rolagem interna: " + sc : ""}\n`);
  }
})().catch((e) => {
  process.stderr.write(String(e && e.stack ? e.stack : e) + "\n");
  process.exit(1);
});
