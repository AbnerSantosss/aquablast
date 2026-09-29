/* eslint-disable @typescript-eslint/no-require-imports */
// LP: mede responsividade das paginas publicas (pedido 2026-09-29-revisar-painel-e-responsivo-lp).
// Em cada largura abre a pagina, rola ate o fim (para os blocos que aparecem na rolagem) e mede:
//  - lateral: largura do documento x janela e os elementos que passam da borda sem um pai que corte;
//  - pequeno: textos visiveis abaixo de 12px (celular) ou 13px (tablet/desktop);
//  - titulos: tamanho de fonte e numero de linhas de h1/h2/h3;
//  - estreito: elementos cujo texto passa da propria caixa (palavra longa sem quebra).
// Grava capturas de pagina inteira em e2e/out/lp-responsivo/ e um resumo em JSON.
// Rodar: NODE_PATH="$(npm root -g)" node e2e/lp-responsivo.cjs   (BASE=http://localhost:3100; SO=rastrear filtra; W=390 so uma largura)
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = path.join(__dirname, "out", "lp-responsivo");
fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = (process.env.W ? process.env.W.split(",").map(Number) : [360, 390, 768, 1024, 1440]).map((w) => ({
  width: w,
  height: w < 700 ? 800 : w < 1100 ? 1024 : 900,
}));
const ROUTES = ["/", "/rastrear", "/trocas-e-devolucoes", "/politica-de-privacidade", "/condicoes-de-compra", "/checkout"].filter(
  (r) => !process.env.SO || r.includes(process.env.SO),
);

function measure() {
  const vw = window.innerWidth;
  const minFont = vw < 700 ? 12 : 13;
  const clips = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX !== "visible" || s.overflow !== "visible" || s.clipPath !== "none") return true;
    }
    return false;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const tag = (el) => {
    const c = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return el.tagName.toLowerCase() + c;
  };
  const text = (el) => (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const all = [...document.querySelectorAll("body *")].filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "svg", "path"].includes(el.tagName));

  const lateral = [];
  const estreito = [];
  const pequeno = new Map();
  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !clips(el)) lateral.push(`${tag(el)} [${Math.round(r.left)}..${Math.round(r.right)}] "${text(el)}"`);
    const s = getComputedStyle(el);
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (ownText) {
      const fs = parseFloat(s.fontSize);
      if (fs < minFont) {
        const k = `${fs}px ${tag(el)}`;
        if (!pequeno.has(k)) pequeno.set(k, text(el));
      }
      if (el.scrollWidth > el.clientWidth + 1 && s.overflowX === "visible" && el.clientWidth > 0 && s.display !== "inline")
        estreito.push(`${tag(el)} ${el.clientWidth}/${el.scrollWidth} "${text(el)}"`);
    }
  }
  const titulos = [...document.querySelectorAll("h1, h2, h3")].filter(visible).map((h) => {
    const s = getComputedStyle(h);
    const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
    return `${h.tagName.toLowerCase()} ${Math.round(parseFloat(s.fontSize))}px ${Math.round(h.getBoundingClientRect().height / lh)}l "${text(h)}"`;
  });
  return {
    doc: `${document.documentElement.scrollWidth}/${vw}`,
    lateral: lateral.slice(0, 15),
    pequeno: [...pequeno].slice(0, 20).map(([k, v]) => `${k} "${v}"`),
    estreito: estreito.slice(0, 10),
    titulos,
  };
}

(async () => {
  const browser = await chromium.launch();
  const resumo = {};
  for (const vp of WIDTHS) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vp.width < 700, hasTouch: vp.width < 1100 });
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      const key = `${route} @${vp.width}`;
      try {
        await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 90000 });
        // Aceitar/fechar nada: so rolar para os blocos com animacao de entrada aparecerem.
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < h; y += Math.round(vp.height * 0.7)) {
          await page.evaluate((yy) => window.scrollTo(0, yy), y);
          await page.waitForTimeout(120);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        const m = await page.evaluate(measure);
        resumo[key] = m;
        const file = `${route === "/" ? "home" : route.replace(/\//g, "_").replace(/^_/, "")}-${vp.width}.png`;
        await page.screenshot({ path: path.join(OUT, file), fullPage: true });
        console.log(`\n== ${key}  doc ${m.doc}  lateral ${m.lateral.length}  pequeno ${m.pequeno.length}  estreito ${m.estreito.length}`);
        for (const l of m.lateral) console.log("  LATERAL  " + l);
        for (const l of m.estreito) console.log("  ESTREITO " + l);
        for (const l of m.pequeno) console.log("  PEQUENO  " + l);
        if (process.env.TIT) for (const l of m.titulos) console.log("  TITULO   " + l);
      } catch (e) {
        console.log(`\n== ${key}  ERRO ${e.message.split("\n")[0]}`);
      }
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, "resumo.json"), JSON.stringify(resumo, null, 2));
  await browser.close();
})();
