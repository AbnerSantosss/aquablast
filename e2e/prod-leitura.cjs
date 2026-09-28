/* eslint-disable @typescript-eslint/no-require-imports */
// Conferencia de PRODUCAO, so leitura: nao compra, nao entra no painel, nao envia formulario.
// Uso: NODE_PATH="$(npm root -g)" node e2e/prod-leitura.cjs [https://aquablastbrasil.com.br] [proprio|zedy]
// O segundo argumento e o modo esperado do checkout (padrao "proprio" desde 2026-09-28, quando o dono pediu
// "quero tudo atualizado nosso": a LP leva para o nosso /checkout; sem gateway, o cliente ve o aviso no pagamento).
const { chromium } = require("playwright");

const BASE = (process.argv[2] || "https://aquablastbrasil.com.br").replace(/\/$/, "");
const MODE = process.argv[3] === "zedy" ? "zedy" : "proprio";
let failed = 0;

async function check(name, fn) {
  try {
    const note = await fn();
    process.stdout.write(`[OK] ${name}${note ? ` - ${note}` : ""}\n`);
  } catch (e) {
    failed += 1;
    process.stdout.write(`[FALHOU] ${name} - ${e instanceof Error ? e.message : String(e)}\n`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  await check("health", async () => {
    const r = await ctx.request.get(`${BASE}/api/health`);
    const j = await r.json();
    assert(r.status() === 200 && j.ok === true && j.db === true, `status ${r.status()} ${JSON.stringify(j)}`);
  });

  await check(`checkout/config existe e esta em modo ${MODE}`, async () => {
    const r = await ctx.request.get(`${BASE}/api/checkout/config`);
    assert(r.status() === 200, `status ${r.status()} (404 = imagem antiga)`);
    const body = await r.text();
    assert(new RegExp(`"mode"\\s*:\\s*"${MODE}"`).test(body), `modo inesperado: ${body.slice(0, 200)}`);
    return `mode ${MODE}`;
  });

  await check("LP abre sem erro de pagina", async () => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const r = await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 45000 });
    assert(r && r.status() === 200, `status ${r ? r.status() : "sem resposta"}`);
    await page.waitForTimeout(1500);
    assert(errors.length === 0, `erros: ${errors.join(" | ").slice(0, 300)}`);
    return await page.title();
  });

  await check(`botoes de compra apontam para ${MODE === "zedy" ? "a Zedy" : "o checkout proprio"}`, async () => {
    // Desde 2026-09-28 o Comprar nasce em /checkout e so vira link da Zedy depois que /api/checkout/config responde.
    if (MODE === "zedy") {
      await page
        .waitForFunction(() => [...document.querySelectorAll("a[data-purchase]")].some((a) => a.href.includes("seguro.aquablastbrasil.com.br")), null, { timeout: 10000 })
        .catch(() => {});
    } else {
      await page.waitForTimeout(3000);
    }
    const hrefs = await page.$$eval("a[data-purchase]", (as) => as.map((a) => a.href));
    const zedy = hrefs.filter((h) => h.includes("seguro.aquablastbrasil.com.br"));
    const proprio = hrefs.filter((h) => new URL(h).host === new URL(BASE).host && new URL(h).pathname === "/checkout");
    assert(hrefs.length > 0, "nenhum botao de compra (a[data-purchase])");
    if (MODE === "zedy") {
      assert(zedy.length > 0 && proprio.length === 0, `${zedy.length} Zedy, ${proprio.length} proprio`);
      return `${zedy.length} link(s) Zedy`;
    }
    assert(zedy.length === 0 && proprio.length === hrefs.length, `${zedy.length} Zedy, ${proprio.length} proprio de ${hrefs.length}`);
    return `${proprio.length} link(s) para /checkout`;
  });

  await check("preco na LP (Pix 159,90 / cartao 169,90)", async () => {
    // O valor do cartao so fica visivel com "cartao" escolhido: confere no HTML, nao no texto visivel.
    const text = await page.evaluate(() => document.body.innerText);
    const html = await page.content();
    assert(text.includes("159,90"), "159,90 nao aparece");
    assert(html.includes("169,90"), "169,90 nao esta no HTML");
  });

  if (MODE === "proprio") {
    await check("checkout proprio abre com parcela em destaque, selos e rodape", async () => {
      const r = await page.goto(`${BASE}/checkout?pack=unit&cor=azul`, { waitUntil: "load", timeout: 45000 });
      assert(r && r.status() === 200, `status ${r ? r.status() : "sem resposta"} em ${page.url()}`);
      const total = await page.locator(".total").innerText();
      // Com o cartao desligado no roteamento (2026-09-28: so Pix pela IronPay) nao ha parcela para mostrar.
      const cfg = await (await ctx.request.get(`${BASE}/api/checkout/config`)).json();
      if (cfg.card && cfg.card.available) assert(/12x de R\$\s?14,16/.test(total), `total sem a parcela: ${total}`);
      else assert(/159,90/.test(total) && /Pix/i.test(total), `total sem o valor do Pix: ${total}`);
      assert((await page.locator(".trust-seals li").count()) >= 3, "selos ausentes");
      assert((await page.locator("footer.ck-footer").count()) === 1, "rodape ausente");
      return total.replace(/\s+/g, " ");
    });
  }

  await check("login do painel sem entrada rapida", async () => {
    const r = await page.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: 45000 });
    assert(r && r.status() === 200, `status ${r ? r.status() : "sem resposta"}`);
    const html = await page.content();
    assert(!/Entrada r[aá]pida/i.test(html), "botao de entrada rapida presente em producao");
    assert(!html.includes("login-dev"), "bloco login-dev presente em producao");
  });

  await check("painel fechado sem sessao", async () => {
    await page.goto(`${BASE}/admin/checkout`, { waitUntil: "load", timeout: 45000 });
    assert(new URL(page.url()).pathname.startsWith("/admin/login"), `parou em ${page.url()}`);
  });

  await check("celular 360px sem rolagem horizontal", async () => {
    const m = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    const p = await m.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "load", timeout: 45000 });
    await p.waitForTimeout(1000);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await m.close();
    assert(over <= 1, `sobra horizontal de ${over}px`);
  });

  await browser.close();
  process.stdout.write(failed ? `\n${failed} falha(s)\n` : "\ntodos passaram\n");
  process.exitCode = failed ? 1 : 0;
})();
