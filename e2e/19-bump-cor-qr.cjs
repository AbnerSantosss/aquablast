/* eslint-disable @typescript-eslint/no-require-imports */
// 19 - Cor da 2a unidade no order bump + QR do Pix gerado do copia-e-cola
// (etapa C do pedido 2026-09-30-rastreio-sla-pix-qr-bump-cor-pixels).
// Alvo: dev em http://localhost:3100 + banco local. Rodar: NODE_PATH="$(npm root -g)" node e2e/19-bump-cor-qr.cjs
//
// 19a (1440): bump marcado sem cor -> aviso "Escolha a cor para continuar", FINALIZAR nao chama /pay e leva o foco
//     para as cores; escolhe Vermelho -> resumo "vermelho", Pix gera com bumpColor no corpo; qrUrl da resposta e
//     data:image/svg e decodifica igual ao codigo; banco: carrinho ["azul","vermelho"] e item AQB-KIT-AZUL-VERMELHO.
//     Pagina do pedido (/checkout/pedido/<token>, PixWatch): QR real visivel, decodificado == campo pix-code.
// 19b (360, celular): cores cabem sem rolagem lateral; pagina do pedido com o QR recolhido em "Mostrar QR Code";
//     POST direto em /api/checkout/pay com bump e sem bumpColor -> 400 "Escolha a cor da 2a unidade" sem criar pedido.
//
// Decodificacao: jsQR (NAO e dependencia do projeto). Procura em E2E_JSQR ou no scratchpad da sessao que validou o
// encoder; se nao achar, pula so a decodificacao com aviso (o resto do teste roda). O SVG e desenhado num canvas em
// escala inteira do viewBox (5 px por modulo): em escala quebrada o jsQR erra por aliasing (ver Andamento do pedido).
const fs = require("fs");
const path = require("path");
const L = require("./_lib.cjs");
const { assert, withDb } = L;

// Caminho da pasta do jsqr instalado fora do projeto (ex.: npm i jsqr numa pasta de rascunho). Sem caminho fixo de
// maquina aqui: o arquivo vai para o git. Tambem tenta require("jsqr") (acha se estiver no NODE_PATH global).
const JSQR_CANDIDATES = [process.env.E2E_JSQR].filter(Boolean);
let jsQR = null;
for (const p of JSQR_CANDIDATES) {
  try {
    if (fs.existsSync(p)) { jsQR = require(p); break; }
  } catch {}
}
if (!jsQR) {
  try { jsQR = require("jsqr"); } catch {}
}
if (!jsQR) process.stdout.write("[AVISO] jsqr nao encontrado (E2E_JSQR): a decodificacao do QR sera pulada.\n");

const one = async (sql, args) => (await withDb((c) => c.query(sql, args))).rows[0];

/** Rasteriza um data:image/svg (QR) num canvas em escala inteira e devolve o texto lido pelo jsQR (null se pulou). */
async function decodeQr(page, src) {
  if (!jsQR) return null;
  const px = await page.evaluate(async (s) => {
    const svg = decodeURIComponent(s.slice(s.indexOf(",") + 1));
    const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    if (!m) throw new Error("SVG sem viewBox");
    const scale = 5;
    const w = Number(m[1]) * scale;
    const img = new Image();
    img.src = s;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = w;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, w);
    ctx.drawImage(img, 0, 0, w, w);
    const data = ctx.getImageData(0, 0, w, w).data;
    let bin = "";
    for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
    return { w, b64: btoa(bin) };
  }, src);
  const buf = Buffer.from(px.b64, "base64");
  const r = jsQR(new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length), px.w, px.w);
  assert.ok(r, "jsQR nao conseguiu ler o QR");
  return r.data;
}

async function payCalls(requests) {
  return requests.filter((r) => r.url.startsWith(`${L.BASE}/api/checkout/pay`) && r.method === "POST");
}

async function c19a() {
  const { browser, page, requests, pageErrors } = await L.open({ width: 1440, height: 900 });
  try {
    await L.toPayment(page, "pack=unit&cor=azul");
    await L.choosePix(page);
    await L.waitText(page.locator(".order-bump h4"), "Leve a segunda unidade com desconto");
    assert.equal(await page.locator(".bump-colors").count(), 0, "cores so aparecem com o bump marcado");
    // Bump redesenhado (a446b8c): abre pelo .bump-open-trigger; cor + botao "Selecionar segunda unidade com desconto".
    await page.locator(".bump-open-trigger").click();
    await L.waitText(page.locator(".bump-choice"), "ESCOLHA SUA SEGUNDA UNIDADE");
    await L.waitText(page.locator("#bump-color-title"), "Escolha a cor da sua segunda AquaBlast");
    assert.equal(await page.locator('input[name="bump-color"]').count(), 3, "3 cores");
    assert.equal(await page.locator('input[name="bump-color"]:checked').count(), 0, "nenhuma cor pre-escolhida");
    assert.equal(await page.locator(".bump-color-alert").getAttribute("aria-live"), "polite");
    await L.waitText(page.locator(".bump-summary"), /cor a escolher/);
    for (const opt of await page.locator("label.bump-color").all()) {
      const b = await opt.boundingBox();
      assert.ok(b && b.height >= 44, `cor com alvo de ${b ? b.height : 0}px (< 44)`);
    }

    // Sem cor: FINALIZAR nao cobra, destaca o bump e leva o foco para as cores.
    const before = (await payCalls(requests)).length;
    const fin = page.locator(".pix-payment-start .pix-primary"); // "Gerar código Pix"
    assert.equal(await fin.getAttribute("aria-disabled"), "true", "FINALIZAR deveria estar aria-disabled sem a cor");
    // aria-disabled (nao disabled): o clique continua chegando e serve para levar a pessoa ate as cores.
    // O Playwright trata aria-disabled como desabilitado, por isso o force.
    await fin.click({ force: true });
    await page.waitForFunction(() => document.activeElement?.getAttribute("name") === "bump-color", null, { timeout: 5000 });
    await page.locator(".order-bump.needs-color.is-nudged").waitFor({ timeout: 5000 });
    await L.waitText(page.locator(".bump-color-alert"), "Escolha uma cor para continuar.");
    await page.waitForTimeout(800);
    assert.equal((await payCalls(requests)).length, before, "nao deveria chamar /api/checkout/pay sem a cor");
    assert.equal(await L.field(page, "pix-code").count(), 0, "Pix nao deveria ser gerado sem a cor");
    await L.shot(page, "c19-bump-sem-cor", false);

    // Escolhe Vermelho: resumo, miniatura e Pix.
    await page.locator('input[name="bump-color"][value="vermelho"]').check();
    await L.waitText(page.locator(".bump-summary"), /\+ 1 AquaBlast vermelho.*R\$ 90,00/);
    await L.waitText(page.locator(".order-summary .total b"), "R$ 249,90");
    assert.equal(await page.locator(".bump-color-alert").textContent(), "", "aviso some com a cor escolhida");
    // Cor escolhida mas nao confirmada: o Pix continua bloqueado ate "Selecionar segunda unidade com desconto".
    await L.btn(page, "Selecionar segunda unidade com desconto").click();
    await L.waitText(page.locator(".bump-choice"), "SEGUNDA UNIDADE SELECIONADA");
    assert.equal(await page.locator(".bump-product img").getAttribute("alt"), "2ª AquaBlast vermelho");
    await L.shot(page, "c19-bump-vermelho", false);

    const respP = page.waitForResponse((r) => r.url().startsWith(`${L.BASE}/api/checkout/pay`) && r.request().method() === "POST", { timeout: 20000 });
    await fin.click();
    const resp = await respP;
    const sent = JSON.parse(resp.request().postData() || "{}");
    assert.equal(sent.bump, true);
    assert.equal(sent.bumpColor, "vermelho", "bumpColor no corpo do /pay");
    const body = await resp.json();
    assert.equal(resp.status(), 200, `pay -> ${resp.status()} ${body.error || ""}`);
    assert.ok(String(body.pix?.qrUrl || "").startsWith("data:image/svg+xml"), "qrUrl deveria ser data:image/svg");
    const fromApi = await decodeQr(page, body.pix.qrUrl);
    if (fromApi !== null) assert.equal(fromApi, body.pix.code, "QR da resposta decodifica diferente do copia-e-cola");
    const code = L.field(page, "pix-code");
    await code.waitFor({ timeout: 15000 });
    assert.equal(await code.inputValue(), body.pix.code);

    // Banco: carrinho com as duas cores, pedido com o kit azul + vermelho.
    const token = await L.cartTokenOf(page);
    const cart = await one("select colors, bump_accepted from checkout_carts where token = $1", [token]);
    assert.deepEqual(cart.colors, ["azul", "vermelho"], "cores do carrinho");
    assert.equal(cart.bump_accepted, true);
    const order = await one(
      "select o.public_token, o.items, o.pix_qr_url from orders o join checkout_carts c on c.id = o.cart_id where c.token = $1 order by o.created_at desc limit 1",
      [token],
    );
    const skus = order.items.map((i) => i.sku);
    assert.ok(skus.some((s) => /AZUL.*VERMELHO/i.test(String(s))), `SKU do kit azul+vermelho; veio ${skus.join(",")}`);
    assert.ok(!String(order.pix_qr_url || "").startsWith("data:image/svg"), "SVG gerado nao deve ser gravado no banco");

    // Pedido retomado (PixWatch): QR real visivel e igual ao codigo.
    await page.goto(`${L.BASE}/checkout/pedido/${order.public_token}`, { waitUntil: "networkidle" });
    const img = page.locator(".ck-qr-real img");
    await img.waitFor({ state: "visible", timeout: 15000 });
    const src = await img.getAttribute("src");
    assert.ok(String(src).startsWith("data:image/svg+xml"), "img do QR deveria ser data:image/svg");
    const box = await img.boundingBox();
    assert.ok(box && box.width >= 200 && box.width <= 260, `QR com ${box ? box.width : 0}px (esperado ~240)`);
    await L.waitText(page.locator(".ck-qr-real figcaption"), "Aponte a câmera do app do banco");
    const pageCode = await L.field(page, "pix-code").inputValue();
    assert.equal(pageCode, body.pix.code, "codigo da pagina do pedido");
    const fromPage = await decodeQr(page, src);
    if (fromPage !== null) assert.equal(fromPage, pageCode, "QR da pagina do pedido decodifica diferente do copia-e-cola");
    await L.noHorizontalScroll(page);
    await L.shot(page, "c19-pedido-qr-1440", false);

    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, [], "erro de JavaScript na pagina");
    return `${skus.join(",")}; QR ${fromPage === null ? "sem decodificar (sem jsqr)" : "decodificado == copia-e-cola"}; publicToken ${order.public_token.slice(0, 6)}…`;
  } finally {
    await browser.close();
  }
}

async function c19b(publicTokenHint) {
  const { browser, page, requests, pageErrors } = await L.open({ width: 360, height: 740, mobile: true });
  try {
    await L.toPayment(page, "pack=unit&cor=preto");
    await L.choosePix(page);
    await page.locator(".bump-open-trigger").click();
    await page.locator(".bump-colors").waitFor();
    await L.noHorizontalScroll(page);
    await page.locator(".order-bump").screenshot({ path: path.join(L.OUT, "c19-bump-360.png") });

    // POST direto sem a cor: 400 e nenhum pedido novo.
    const token = await L.cartTokenOf(page);
    const n0 = await one("select count(*)::int n from orders o join checkout_carts c on c.id = o.cart_id where c.token = $1", [token]);
    const r = await page.evaluate(async (t) => {
      const res = await fetch("/api/checkout/pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cartToken: t, method: "pix", installments: 1, bump: true }) });
      return { status: res.status, body: await res.json() };
    }, token);
    assert.equal(r.status, 400, `esperado 400, veio ${r.status}`);
    assert.match(String(r.body.error), /Escolha a cor da 2ª unidade/);
    const bad = await page.evaluate(async (t) => {
      const res = await fetch("/api/checkout/pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cartToken: t, method: "pix", installments: 1, bump: true, bumpColor: "verde" }) });
      return res.status;
    }, token);
    assert.equal(bad, 400, "cor fora da lista deveria dar 400");
    const n1 = await one("select count(*)::int n from orders o join checkout_carts c on c.id = o.cart_id where c.token = $1", [token]);
    assert.equal(n1.n, n0.n, "nao deveria criar pedido");

    // Pagina do pedido no celular: QR recolhido atras de "Mostrar QR Code", copia-e-cola primeiro.
    if (publicTokenHint) {
      await page.goto(`${L.BASE}/checkout/pedido/${publicTokenHint}`, { waitUntil: "networkidle" });
      const toggle = page.getByRole("button", { name: "Mostrar QR Code" });
      await toggle.waitFor({ timeout: 15000 });
      const tb = await toggle.boundingBox();
      assert.ok(tb && tb.height >= 44, `botao Mostrar QR Code com ${tb ? tb.height : 0}px`);
      assert.equal(await page.locator(".ck-qr-real img").isVisible(), false, "QR comeca recolhido no celular");
      await L.noHorizontalScroll(page);
      await L.shot(page, "c19-pedido-360-recolhido", false);
      await toggle.click();
      await page.locator(".ck-qr-real img").waitFor({ state: "visible" });
      assert.equal(await page.getByRole("button", { name: "Esconder QR Code" }).getAttribute("aria-expanded"), "true");
      await L.noHorizontalScroll(page);
      await page.locator(".ck-pix").screenshot({ path: path.join(L.OUT, "c19-pedido-360-aberto.png") });
    }

    L.checkNetwork(requests);
    assert.deepEqual(pageErrors, [], "erro de JavaScript na pagina");
    return `400 "${String(r.body.error).slice(0, 60)}"`;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  (async () => {
    await L.clearRateLimits();
    let publicToken = null;
    await L.scenario("19a", "Bump pede a cor da 2a unidade; Vermelho -> kit azul+vermelho; QR gerado le igual ao copia-e-cola", async () => {
      const r = await c19a();
      publicToken = (await one(
        "select o.public_token from orders o where o.items::text ilike '%VERMELHO%' and o.payment_status = 'pending' and o.pix_code is not null order by o.created_at desc limit 1",
        [],
      ))?.public_token ?? null;
      return r;
    });
    await L.scenario("19b", "360px: cores sem rolagem lateral, QR recolhido no pedido, POST sem cor -> 400", () => c19b(publicToken));
  })();
}
