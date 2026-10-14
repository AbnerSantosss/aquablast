/* eslint-disable @typescript-eslint/no-require-imports */
// Checkout: mede se cada etapa cabe na altura da janela no computador (pedido 2026-10-11-checkout-100vh-comentarios-admin).
// Abre /checkout em 1366x768, 1440x900 e 1920x1080, anda pelas 3 etapas e pelos estados da etapa 3
// (Pix escolhido, cartao aberto, oferta da 2a unidade aberta e marcada, Pix gerado no gateway local simulado) e grava:
//  - doc: altura rolavel x altura da janela (alvo: doc <= janela);
//  - cta: botao principal do estado, se esta inteiro dentro da janela e sem nada por cima (elementFromPoint);
//  - cortes: caixas com overflow hidden/clip cujo conteudo passa da caixa (conteudo cortado);
//  - rolagens: colunas que estao rolando por dentro (valvula de seguranca em uso);
//  - blocos: topo/base de cada parte para achar quem estoura.
// Duas colunas (pedido 2026-10-11-auditoria-conversao-checkout), so no computador:
//  - colunas: numero de colunas da grade (alvo: 2);
//  - total: linha "Total no Pix/cartao" do resumo inteira dentro da janela e da caixa do resumo, sem rolar;
//  - atras: nota do formulario, oferta, total do cartao e fatos da compra (ul.ck-paytrust) que ficam debaixo do botao preso;
//  - fatos: na etapa 3, se os fatos da compra junto do botao (ul.ck-paytrust) estao inteiros na tela sem rolar;
//  - previa: quantas previas de pagamento existem em etapa futura (alvo: 0).
// No computador o script sai com codigo 1 se algum alvo falhar (pagina rolando, botao fora ou coberto, total fora,
// grade diferente de 2 colunas, previa presente, conteudo cortado ou fatos da compra debaixo do botao).
// Tambem mede 390x844 e 768x1024 (etapas 1 a 3) para provar que o celular nao mudou.
// Tag começando por "sem-avisos": esconde SÓ no navegador do teste o que o modo de teste acrescenta (aviso "Modo de teste",
// botao "Simular pagamento aprovado") e troca o aviso "Ambiente de teste" do cartao pela frase de producao, de uma linha
// ("Não guardamos os dados do seu cartão. A conexão é criptografada."), para medir a altura que o cliente real ve.
// Nao muda configuracao do gateway nem nada no servidor.
// Capturas em e2e/out/checkout-100vh/. Rodar: NODE_PATH="$(npm root -g)" node e2e/medir-checkout-100vh.cjs [tag] [desktop|celular]
const fs = require("fs");
const path = require("path");
const L = require("./_lib.cjs");

const TAG = process.argv[2] || "antes";
const ONLY = process.argv[3] || "";
const SEM_AVISOS = TAG.startsWith("sem-avisos");
const OUT = path.join(__dirname, "out", "checkout-100vh");
fs.mkdirSync(OUT, { recursive: true });
const DESKTOP = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const CELULAR = [
  { width: 390, height: 844, mobile: true },
  { width: 768, height: 1024 },
];
const BLOCKS = [".ck-top", ".ship-bar", ".campaign", ".ck-progress-wrap", ".ck-grid", ".ck-flow", ".ck-side", '.ck-step[data-step="1"]', '.ck-step[data-step="2"]', '.ck-step[data-step="3"]', ".order-summary", ".trust-seals", ".ck-reference-reviews", ".ck-footer"];
const CTA = {
  submit: '.ck-step[aria-current="step"] form button[type="submit"]',
  pix: ".pix-primary",
  card: ".ck-pay-btn",
  bump: ".bump-confirm .primary-button",
  copy: "[data-pix-copy]",
};

async function measure(page, ctaSel) {
  return page.evaluate(({ sels, ctaSel }) => {
    scrollTo(0, 0);
    const r = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top + scrollY), bottom: Math.round(b.bottom + scrollY), h: Math.round(b.height), w: Math.round(b.width) }; };
    const blocks = {};
    for (const s of sels) { const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().height > 0); if (el) blocks[s] = r(el); }
    const label = (el) => `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).filter((c) => !c.includes("__")).slice(0, 3).join(".")}`;
    const root = document.querySelector(".ck-root");
    const cortes = [];
    const rolagens = [];
    for (const el of root ? root.querySelectorAll("*") : []) {
      if (el.clientHeight <= 2 || el.scrollHeight <= el.clientHeight + 1) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy === "hidden" || oy === "clip") cortes.push(`${label(el)} ${el.scrollHeight}>${el.clientHeight}`);
      if (oy === "auto" || oy === "scroll") rolagens.push(`${label(el)} ${el.scrollHeight}>${el.clientHeight}`);
    }
    let cta = null;
    const btn = ctaSel ? [...document.querySelectorAll(ctaSel)].find((e) => e.getBoundingClientRect().height > 0) : null;
    if (btn) {
      const b = btn.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      cta = { ...r(btn), dentro: b.top >= 0 && b.bottom <= innerHeight + 0.5, livre: !!top && (top === btn || btn.contains(top)) };
    }
    const de = document.documentElement;
    // Duas colunas: grade, total do resumo e o que fica debaixo do botao preso.
    const grid = document.querySelector(".ck-grid");
    const colunas = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length : 0;
    const inside = (el, box) => { const b = el.getBoundingClientRect(); return b.height > 0 && b.top >= box.top - 0.5 && b.bottom <= box.bottom + 0.5; };
    const win = { top: 0, bottom: innerHeight };
    const sum = document.querySelector(".order-summary");
    const dt = sum ? [...sum.querySelectorAll("dl dt")].find((e) => /^\s*Total no (Pix|cartão)\s*$/.test(e.textContent || "")) : null;
    const totalRow = dt ? dt.parentElement : null;
    const total = totalRow ? { ...r(totalRow), visivel: inside(totalRow, win) && inside(totalRow, sum.getBoundingClientRect()) } : null;
    const current = document.querySelector('.ck-step[aria-current="step"]');
    const atras = [];
    let fatos = null;
    if (btn && current) {
      const bar = btn.closest(".ck-actions") || btn;
      const k = bar.getBoundingClientRect();
      for (const s of [".inline-help", ".order-bump", ".ck-card-payment-total", ".pix-payment-total", ".pix-bank-guide", ".pix-footnote", "ul.ck-paytrust"]) {
        for (const el of current.querySelectorAll(s)) {
          if (el === bar || el.contains(bar) || bar.contains(el)) continue;
          const b = el.getBoundingClientRect();
          if (b.height > 0 && b.left < k.right - 1 && b.right > k.left + 1 && b.top < k.bottom - 1 && b.bottom > k.top + 1) atras.push(`${s} ${Math.round(b.top)}-${Math.round(b.bottom)} x botao ${Math.round(k.top)}-${Math.round(k.bottom)}`);
        }
      }
    }
    if (current) {
      const pt = [...current.querySelectorAll("ul.ck-paytrust")].find((e) => e.getBoundingClientRect().height > 0);
      if (pt) fatos = { ...r(pt), visivel: inside(pt, win) && inside(pt, current.getBoundingClientRect()) };
    }
    const previa = document.querySelectorAll(".ck-payment-preview, .ck-stage-preview").length;
    return { doc: de.scrollHeight, win: innerHeight, lateral: de.scrollWidth > innerWidth, cta, cortes, rolagens, blocks, colunas, total, atras, fatos, previa };
  }, { sels: BLOCKS, ctaSel });
}

async function run(vp, report, desktop) {
  const { browser, page } = await L.open(vp);
  const tag = `${vp.width}x${vp.height}`;
  try {
    const snap = async (step, ctaSel) => {
      await page.waitForTimeout(600);
      const m = await measure(page, ctaSel);
      report.push({ viewport: tag, step, ...m, sobra: m.win - m.doc });
      await page.screenshot({ path: path.join(OUT, `${TAG}-${tag}-etapa${step}.png`), fullPage: true });
    };
    await L.goCheckout(page, "pack=unit&cor=azul");
    if (SEM_AVISOS) await page.addStyleTag({ content: ".ck-testmode, .pix-test-action { display: none !important; }" });
    await snap(1, CTA.submit);
    await L.fillDados(page);
    await L.submitDados(page);
    if (desktop) await snap("2-vazia", CTA.submit);
    await L.fillEntrega(page);
    await snap(2, CTA.submit);
    await L.submitEntrega(page);
    await snap("3-pix", CTA.pix);
    if (!desktop) return;
    await L.payHead(page, "card").click();
    await page.locator(".ck-pay-btn").first().waitFor({ state: "visible" });
    if (SEM_AVISOS) await page.evaluate(() => { const s = document.querySelector(".ck-cardform > p:first-child > span"); if (s) s.textContent = "Não guardamos os dados do seu cartão. A conexão é criptografada."; });
    await snap("3-cartao", CTA.card);
    await L.choosePix(page);
    await page.locator(".bump-open-trigger").click();
    await L.waitText(page.locator(".bump-choice"), "ESCOLHA SUA SEGUNDA UNIDADE");
    await snap("3-oferta-aberta", CTA.bump);
    await page.locator('input[name="bump-color"][value="preto"]').check();
    await L.btn(page, "Selecionar segunda unidade com desconto").click();
    await L.waitText(page.locator(".bump-choice"), "SEGUNDA UNIDADE SELECIONADA");
    await snap("3-oferta", CTA.pix);
    await page.locator(".pix-primary").click();
    await page.locator("[data-pix-payment-code]").waitFor({ state: "visible", timeout: 20000 });
    await snap("3-pix-gerado", CTA.copy);
  } catch (e) {
    report.push({ viewport: tag, erro: String(e.message).slice(0, 300) });
  } finally {
    await browser.close();
  }
}

(async () => {
  const report = [];
  if (ONLY !== "celular") for (const vp of DESKTOP) await run(vp, report, true);
  if (ONLY !== "desktop") for (const vp of CELULAR) await run(vp, report, false);
  fs.writeFileSync(path.join(OUT, `${TAG}.json`), JSON.stringify(report, null, 1));
  const falhas = [];
  for (const r of report) {
    if (r.erro) { console.log(`${r.viewport} ERRO ${r.erro}`); falhas.push(`${r.viewport}: erro`); continue; }
    const cta = r.cta ? `cta ${r.cta.top}-${r.cta.bottom} ${r.cta.dentro ? "dentro" : "FORA"} ${r.cta.livre ? "livre" : "COBERTO"}` : "cta -";
    const desktop = Number(r.viewport.split("x")[0]) >= 1100;
    let extra = "";
    if (desktop) {
      const total = r.total ? `total ${r.total.top}-${r.total.bottom} ${r.total.visivel ? "visivel" : "FORA"}` : "total AUSENTE";
      const fatos = r.fatos ? ` fatos ${r.fatos.top}-${r.fatos.bottom} ${r.fatos.visivel ? "visiveis" : "abaixo-da-dobra"}` : "";
      extra = ` | ${r.colunas} colunas ${total}${fatos}${r.previa ? ` PREVIA=${r.previa}` : ""}${r.atras.length ? ` ATRAS[${r.atras.join("; ")}]` : ""}`;
      const id = `${r.viewport} etapa ${r.step}`;
      if (r.sobra < 0) falhas.push(`${id}: a pagina rola (${-r.sobra} px)`);
      if (r.lateral) falhas.push(`${id}: rolagem lateral`);
      if (!r.cta || !r.cta.dentro || !r.cta.livre) falhas.push(`${id}: botao principal fora da janela ou coberto`);
      if (!r.total || !r.total.visivel) falhas.push(`${id}: total do resumo fora da vista`);
      if (r.colunas !== 2) falhas.push(`${id}: grade com ${r.colunas} colunas`);
      if (r.previa) falhas.push(`${id}: previa de pagamento em etapa futura`);
      if (r.cortes.length) falhas.push(`${id}: conteudo cortado (${r.cortes.join("; ")})`);
      // Nota do formulario e fatos da compra nunca podem ficar debaixo do botao preso. A oferta e o total do cartao
      // passam por baixo dele quando a etapa rola por dentro (e o proprio de position: sticky): ficam so no relatorio.
      const graves = r.atras.filter((a) => a.startsWith(".inline-help") || a.startsWith("ul.ck-paytrust"));
      if (graves.length) falhas.push(`${id}: debaixo do botao preso (${graves.join("; ")})`);
    }
    console.log(`${r.viewport} etapa ${r.step}: doc ${r.doc} x janela ${r.win} (sobra ${r.sobra}) ${cta}${r.lateral ? " LATERAL" : ""}${r.cortes.length ? ` cortes[${r.cortes.join("; ")}]` : ""}${r.rolagens.length ? ` rolagens[${r.rolagens.join("; ")}]` : ""}${extra}`);
  }
  if (falhas.length) {
    console.log("");
    console.log(`FALHAS (${falhas.length}):`);
    for (const f of falhas) console.log(` - ${f}`);
    process.exitCode = 1;
  } else {
    console.log("");
    console.log("Sem falhas nos alvos medidos.");
  }
})();
