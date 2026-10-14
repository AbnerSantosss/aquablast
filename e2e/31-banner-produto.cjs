/* eslint-disable @typescript-eslint/no-require-imports */
// Banner do checkout por produto: arte pronta enviada pelo painel (/admin/checkout, bloco "Banner por produto").
// Cobre o painel e as rotas: recusas (sem login, origem de fora, arquivo que não é imagem, SVG, arquivo
// grande, produto ou dispositivo inválido), envio pela tela com o teclado, troca (URL nova, a antiga dá 404),
// descrição da imagem, remoção, cabeçalhos da rota pública, a tela em 390 px e o "Salvar aparência" com o
// bloco novo na página.
// Cobre também o checkout (etapa 1), com o corte em 1100 px: a arte do produto escolhido no computador, no
// tablet e no celular, o que aparece sem arte em cada faixa, a troca de cor e a segunda unidade sem recarregar,
// as etapas 2 e 3 sem banner e, pelas requisições, que cada largura só baixa a arte dela.
// No painel as artes de teste são imagens que já estão em public/; no checkout são retângulos desenhados aqui,
// no tamanho recomendado que o painel mostra. O roteiro só mexe nos espaços de SLOTS: guarda o que
// houver neles, esvazia, e no fim (mesmo falhando no meio) apaga o que criou e devolve o que guardou.
// Cenário novo entra dentro do `try` e usa só espaços que estejam em SLOTS.
// Rodar: NODE_PATH="$(npm root -g)" node e2e/31-banner-produto.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { withDb } = require("./_db.cjs");
const L = require("./_lib.cjs");

const BASE = process.env.E2E_BASE || "http://localhost:3100";
const OUT = path.join(__dirname, "out");
const MAX_BYTES = 2 * 1024 * 1024;
const MB = 1024 * 1024;
const LONG_CACHE = "public, max-age=31536000, immutable";
const NOT_IMAGE = /não é uma imagem JPEG, PNG ou WebP/;
const ALT = "Arte de teste e2e 31";
const ALT_KIT = "Arte de teste e2e 31 (kit)";
/**
 * Espaços (produto, dispositivo) que o roteiro usa. A guarda e a limpeza só olham para estes.
 * A unidade preta não recebe arte: está na lista para a guarda esvaziar os dois espaços dela e o checkout
 * poder mostrar, com certeza, o que aparece quando o produto está sem arte.
 */
const SLOTS = [
  ["unit-azul", "desktop"],
  ["unit-azul", "mobile"],
  ["kit", "desktop"],
  ["kit", "mobile"],
  ["unit-preto", "desktop"],
  ["unit-preto", "mobile"],
];
const BANNER_IMAGE = "/api/checkout/banner-image/";
/** Campo da etapa 1 do checkout: quando o React assume este campo, a página está pronta para o roteiro. */
const CHECKOUT_FIELD = '.ck-flow [name="name"]';

const publicFile = (name) => fs.readFileSync(path.join(__dirname, "..", "public", name));
const api = (product, device) => `${BASE}/api/admin/checkout-banners/${product}/${device}`;
const imagePath = (id) => `/api/checkout/banner-image/${id}`;
const imageUrl = (id) => BASE + imagePath(id);
const slotSelector = (product, device) => `.cb-slot[data-product="${product}"][data-device="${device}"]`;
const slotRows = (product, device) =>
  withDb(async (c) => (await c.query("select id, alt, mime, width, height, octet_length(bytes) as size from checkout_banners where product = $1 and device = $2", [product, device])).rows);

const steps = [];
function pass(text) {
  steps.push(text);
  console.log("ok  " + text);
}

// ---------- Guarda e limpeza ----------
let savedArt = [];
let savedTheme = null;

/** Guarda as artes que já estavam nos espaços do roteiro (e a linha do tema) e esvazia esses espaços. */
async function guard() {
  await withDb(async (c) => {
    for (const [product, device] of SLOTS) {
      const found = await c.query("select id, product, device, alt, mime, width, height, bytes, created_at from checkout_banners where product = $1 and device = $2", [product, device]);
      savedArt.push(...found.rows);
    }
    savedTheme = (await c.query("select key, value, encrypted, updated_at, updated_by from settings where key = 'checkout.theme'")).rows[0] ?? null;
    for (const [product, device] of SLOTS) await c.query("delete from checkout_banners where product = $1 and device = $2", [product, device]);
  });
  if (savedArt.length) console.log(`aviso: ${savedArt.length} arte(s) que já estavam nos espaços do roteiro foram guardadas e voltam no fim.`);
}

/** Devolve a linha do tema ao que era antes do "Salvar aparência" do roteiro (sem linha antes = sem linha depois). */
async function restoreTheme() {
  await withDb(async (c) => {
    if (!savedTheme) {
      await c.query("delete from settings where key = 'checkout.theme'");
      return;
    }
    await c.query("update settings set value = $1::jsonb, encrypted = $2, updated_at = $3, updated_by = $4 where key = 'checkout.theme'", [
      JSON.stringify(savedTheme.value),
      savedTheme.encrypted,
      savedTheme.updated_at,
      savedTheme.updated_by,
    ]);
  });
}

/** Apaga o que o roteiro criou nos espaços dele e devolve o que estava lá antes, com o mesmo id (mesma URL). */
async function restore() {
  await withDb(async (c) => {
    const keep = savedArt.map((row) => row.id);
    for (const [product, device] of SLOTS) await c.query("delete from checkout_banners where product = $1 and device = $2 and id <> all($3::uuid[])", [product, device, keep]);
    for (const row of savedArt) {
      await c.query(
        "insert into checkout_banners (id, product, device, alt, mime, width, height, bytes, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (id) do nothing",
        [row.id, row.product, row.device, row.alt, row.mime, row.width, row.height, row.bytes, row.created_at],
      );
    }
  });
  await restoreTheme();
}

(async () => {
  await guard();
  const startedAt = Date.now();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
  context.setDefaultTimeout(45000);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  // Erros que o React ou o Next escrevem no console (hidratação, chave repetida etc.). As recusas provocadas
  // pelo roteiro aparecem como "Failed to load resource" e não contam.
  const consoleErrors = [];
  const watchConsole = (target, tag) =>
    target.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) consoleErrors.push(`[${tag}] ${message.text().slice(0, 4000)}`);
    });
  watchConsole(page, "1440");
  // Espera o React assumir o bloco (em desenvolvimento isso leva um instante depois do "load"). Sem esperar,
  // a captura do Playwright, que mexe no estilo dos campos para esconder o cursor, chega antes da hidratação
  // e o Next acusa uma diferença entre servidor e navegador que não existe para quem usa o painel.
  const hydrated = (target, selector = "#banner-por-produto input, #banner-por-produto button") =>
    target.waitForFunction((css) => {
      const controls = [...document.querySelectorAll(css)];
      return controls.length > 0 && controls.every((el) => Object.keys(el).some((key) => key.startsWith("__reactProps")));
    }, selector);
  // Navegadores do checkout (um por largura, abertos por _lib.open): fecham no `finally`, junto com o do painel.
  const checkoutBrowsers = [];
  // Remover a arte pede confirmação (window.confirm, padrão do painel).
  const dialogs = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    dialog.accept();
  });
  let uploads = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/admin/checkout-banners/")) uploads += 1;
  });
  // Falhas que não interrompem o roteiro: aparecem no fim, depois da limpeza, e derrubam o resultado.
  const late = [];

  const png = publicFile("og-verao.png");
  const jpg = publicFile("kit-duas-unidades.jpg");
  const webp = publicFile("produto-azul.webp");
  const svg = publicFile("icon.svg");
  const big = publicFile("campanha-abertura.png");
  const send = (product, device, name, mimeType, buffer, fields = {}) =>
    context.request.post(api(product, device), { headers: { origin: BASE }, multipart: { file: { name, mimeType, buffer }, ...fields } });
  const patch = (product, device, data) => context.request.patch(api(product, device), { headers: { origin: BASE }, data });
  const naturalSize = (src) =>
    page.evaluate(async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, src);
  const focusedLabel = () => page.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-label"));

  try {
    let res;
    let body;

    // ---------- Sem login: nada entra ----------
    const anon = await browser.newContext();
    const anonCalls = [
      ["post", { multipart: { file: { name: "arte.png", mimeType: "image/png", buffer: png } } }],
      ["patch", { data: { alt: ALT } }],
      ["delete", {}],
    ];
    for (const [method, options] of anonCalls) {
      res = await anon.request[method](api("unit-azul", "desktop"), { headers: { origin: BASE }, ...options });
      assert.equal(res.status(), 401, `${method} sem login`);
      assert.equal((await res.json()).error, "Faça login no painel.");
    }
    assert.equal((await slotRows("unit-azul", "desktop")).length, 0, "nada gravado sem login");
    pass("sem login do painel: envio, descrição e remoção recusados (401) e nada é gravado");

    // ---------- Painel: entrar e abrir a tela ----------
    await page.goto(BASE + "/admin/login");
    await page.getByRole("button", { name: /Entrada r[aá]pida/i }).click();
    await page.waitForURL(/\/admin(?!\/login)/);
    await page.goto(BASE + "/admin/checkout");
    const block = page.locator("#banner-por-produto");
    await block.getByRole("heading", { name: "Banner por produto" }).waitFor();
    await hydrated(page);
    const products = ["Unidade azul", "Unidade vermelha", "Unidade preta", "Kit com 2"];
    assert.deepEqual(await block.locator(".cb-product-name").allInnerTexts(), products, "uma linha por produto");
    assert.equal(await block.locator(".cb-slot").count(), 8, "dois espaços por produto");
    for (const product of products) {
      for (const device of ["computador", "celular e tablet"]) {
        assert.equal(await block.getByRole("group", { name: `${product}, ${device}` }).count(), 1, `espaço ${product}, ${device}`);
        const button = block.getByRole("button", { name: new RegExp(`^(Enviar arquivo|Trocar): ${product}, ${device}$`) });
        assert.equal(await button.count(), 1, `botão de envio com produto e dispositivo no rótulo: ${product}, ${device}`);
      }
    }
    assert.deepEqual((await block.locator(".cb-product").first().locator(".cb-device").allInnerTexts()).map((text) => text.trim()), ["Computador", "Celular e tablet"], "colunas Computador e Celular e tablet");
    assert.equal(await block.evaluate((el) => Boolean(el.closest("form")) || el.querySelectorAll("form").length > 0), false, "bloco fora de qualquer formulário");
    assert.equal(await page.locator('form input[type="file"]').count(), 0, "nenhum campo de arquivo dentro de formulário");
    const slotA = block.locator(slotSelector("unit-azul", "desktop"));
    const slotKit = block.locator(slotSelector("kit", "mobile"));
    assert.equal(await slotA.getAttribute("data-filled"), "false");
    const emptyA = await slotA.innerText();
    assert.ok(emptyA.includes("Sem arte") && emptyA.includes("No computador o checkout mostra o banner de texto."), "espaço vazio do computador diz o que aparece no lugar: " + emptyA);
    const emptyKit = await slotKit.innerText();
    assert.ok(emptyKit.includes("No celular o checkout não mostra banner. No tablet, mostra o banner de texto."), "espaço vazio do celular e tablet diz o que aparece no lugar em cada um: " + emptyKit);
    const HINT = /^Recomendado: (\d+) x (\d+) px\. JPEG, PNG ou WebP, até 2 MB\.$/;
    const hint = (await slotA.locator(".cb-hint").innerText()).trim().match(HINT);
    assert.ok(hint, "tamanho recomendado, formatos e limite no espaço");
    const hintMobile = (await slotKit.locator(".cb-hint").innerText()).trim().match(HINT);
    assert.ok(hintMobile, "tamanho recomendado, formatos e limite também no espaço do celular e tablet");
    /** Tamanho recomendado de cada dispositivo, como o painel mostra (vem de BANNER_RECOMMENDED). */
    const recommended = { desktop: [Number(hint[1]), Number(hint[2])], mobile: [Number(hintMobile[1]), Number(hintMobile[2])] };
    const recommendedRatio = Number(hint[1]) / Number(hint[2]);
    assert.equal(await slotA.getByRole("button", { name: /^Remover/ }).count(), 0, "espaço vazio não tem Remover");
    pass(`painel: bloco "Banner por produto" fora do formulário, 4 produtos x 2 dispositivos, espaços vazios com "Sem arte" e recomendado ${hint[1]} x ${hint[2]} px`);

    // ---------- Servidor: recusas com a causa ----------
    res = await context.request.post(api("unit-azul", "desktop"), { headers: { origin: "https://outro-site.example" }, multipart: { file: { name: "arte.png", mimeType: "image/png", buffer: png } } });
    assert.equal(res.status(), 403, "origem de fora recusada");
    assert.equal((await res.json()).error, "Origem não permitida.");

    res = await send("unit-azul", "desktop", "arte.png", "image/png", Buffer.from("isto é só texto com nome de PNG"));
    body = await res.json();
    assert.equal(res.status(), 400, "texto com extensão .png recusado");
    assert.match(body.error, NOT_IMAGE);
    for (const [name, mimeType] of [["icone.svg", "image/svg+xml"], ["icone.png", "image/png"]]) {
      res = await send("unit-azul", "desktop", name, mimeType, svg);
      body = await res.json();
      assert.equal(res.status(), 400, `SVG recusado (enviado como ${mimeType})`);
      assert.match(body.error, NOT_IMAGE);
    }
    res = await send("unit-azul", "desktop", "vazio.png", "image/png", Buffer.alloc(0));
    assert.equal(res.status(), 400, "arquivo vazio recusado");
    pass(`servidor recusa texto com nome de PNG, SVG e arquivo vazio (confere os bytes, não o nome nem o tipo declarado): "${body.error}"`);

    assert.ok(big.length > MAX_BYTES, "public/campanha-abertura.png passa de 2 MB");
    res = await send("unit-azul", "desktop", "campanha-abertura.png", "image/png", big);
    body = await res.json();
    assert.equal(res.status(), 413, "arquivo grande recusado");
    const told = body.error.match(/^O arquivo tem (\d+),(\d{2}) MB; o limite é 2 MB\. Exporte a arte em JPG ou WebP, ou em um tamanho menor, e envie de novo\.$/);
    assert.ok(told, "recusa diz tamanho recebido, limite e o que fazer: " + body.error);
    assert.ok(Math.abs(Number(`${told[1]}.${told[2]}`) - big.length / MB) <= 0.011, `tamanho dito (${told[1]},${told[2]} MB) bate com o arquivo (${(big.length / MB).toFixed(3)} MB)`);
    const bigMessage = body.error;
    // Um byte acima do limite: PNG de verdade com bytes sobrando depois do fim da imagem.
    res = await send("unit-azul", "desktop", "quase.png", "image/png", Buffer.concat([png, Buffer.alloc(MAX_BYTES + 1 - png.length)]));
    body = await res.json();
    assert.equal(res.status(), 413, "um byte acima do limite recusado");
    assert.ok(body.error.startsWith("O arquivo tem 2,01 MB; o limite é 2 MB."), "logo acima do limite não aparece como igual ao limite: " + body.error);
    pass(`servidor recusa arquivo acima de 2 MB: "${bigMessage}"`);

    const NOT_FOUND = "Espaço de banner não encontrado. Atualize a página.";
    for (const [product, device] of [["unit-roxo", "desktop"], ["unit-azul", "tablet"], ["KIT", "mobile"], ["unit", "desktop"]]) {
      res = await send(product, device, "arte.png", "image/png", png);
      assert.equal(res.status(), 404, `envio em ${product}/${device}`);
      assert.equal((await res.json()).error, NOT_FOUND);
      assert.equal((await patch(product, device, { alt: ALT })).status(), 404, `descrição em ${product}/${device}`);
      assert.equal((await context.request.delete(api(product, device), { headers: { origin: BASE } })).status(), 404, `remoção em ${product}/${device}`);
    }
    const strangers = await withDb(async (c) => Number((await c.query("select count(*) as n from checkout_banners where product not in ('unit-azul', 'unit-vermelho', 'unit-preto', 'kit') or device not in ('desktop', 'mobile')")).rows[0].n));
    assert.equal(strangers, 0, "nenhuma linha com produto ou dispositivo fora das listas");
    pass("produto ou dispositivo fora das listas: 404 no envio, na descrição e na remoção, e nada é gravado");

    res = await send("unit-azul", "desktop", "arte.png", "image/png", png, { alt: "x".repeat(121) });
    body = await res.json();
    assert.equal(res.status(), 400, "descrição de 121 caracteres recusada no envio");
    assert.match(body.error, /tem 121 caracteres; o limite é 120/);
    res = await patch("unit-azul", "desktop", { alt: ALT });
    assert.equal(res.status(), 404, "descrição em espaço sem arte");
    assert.match((await res.json()).error, /está sem arte/);
    res = await context.request.delete(api("unit-azul", "desktop"), { headers: { origin: BASE } });
    assert.equal(res.status(), 404, "remoção em espaço sem arte");
    for (const [product, device] of SLOTS) assert.equal((await slotRows(product, device)).length, 0, `nenhuma recusa gravou arte em ${product}/${device}`);
    pass("descrição acima de 120 caracteres recusada; descrição e remoção em espaço sem arte dão 404; nenhuma recusa gravou nada");

    // ---------- Tela: recusas com a causa ----------
    const fileA = slotA.locator('input[type="file"]');
    assert.equal(await fileA.getAttribute("accept"), "image/jpeg,image/png,image/webp");
    uploads = 0;
    await fileA.setInputFiles({ name: "arte.png", mimeType: "image/png", buffer: Buffer.from("isto é só texto com nome de PNG") });
    await slotA.locator(".af-result.is-err", { hasText: "não é uma imagem JPEG, PNG ou WebP" }).waitFor();
    assert.equal(uploads, 1, "arquivo que não é imagem vai ao servidor, que recusa");
    await fileA.setInputFiles({ name: "campanha-abertura.png", mimeType: "image/png", buffer: big });
    await slotA.locator(".af-result.is-err", { hasText: "o limite é 2 MB" }).waitFor();
    assert.equal((await slotA.locator(".af-result.is-err").innerText()).trim(), bigMessage, "mesma recusa do servidor, dita já no navegador");
    assert.equal(uploads, 1, "arquivo grande é recusado no navegador, sem envio");
    assert.equal(await slotA.getAttribute("data-filled"), "false", "espaço continua vazio depois das recusas");
    pass("tela mostra a causa da recusa no próprio espaço: arquivo que não é imagem e arquivo acima de 2 MB");

    // ---------- Envio válido pela tela, pelo teclado ----------
    await slotA.getByRole("button", { name: "Enviar arquivo: Unidade azul, computador" }).focus();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Enter")]);
    assert.equal(chooser.isMultiple(), false, "um arquivo por espaço");
    await chooser.setFiles({ name: "og-verao.png", mimeType: "image/png", buffer: png });
    await slotA.locator(".af-result.is-ok", { hasText: "Arte enviada." }).waitFor();
    await block.locator(slotSelector("unit-azul", "desktop") + '[data-filled="true"]').waitFor();
    let rows = await slotRows("unit-azul", "desktop");
    assert.equal(rows.length, 1, "uma arte no espaço");
    const first = rows[0];
    assert.equal(first.mime, "image/png");
    assert.equal(first.size, png.length, "arte guardada como enviada, sem recompressão");
    assert.equal(first.alt, "", "sem descrição gravada");
    const thumb = slotA.locator(".cb-thumb img");
    await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await thumb.elementHandle());
    assert.deepEqual(await thumb.evaluate((el) => [el.naturalWidth, el.naturalHeight]), [first.width, first.height], "largura e altura lidas do cabeçalho PNG = as que o navegador lê");
    assert.ok((await thumb.getAttribute("src")).endsWith(imagePath(first.id)), "miniatura vem da rota pública");
    assert.equal(await thumb.getAttribute("alt"), "Banner AquaBlast Azul", "sem descrição, vale o texto padrão");
    assert.match((await slotA.locator(".cb-meta").innerText()).trim(), new RegExp(`^${first.width} x ${first.height} px, \\d+ KB, PNG$`), "miniatura com largura x altura");
    assert.equal(await slotA.getByRole("button", { name: "Trocar: Unidade azul, computador" }).count(), 1, 'botão vira "Trocar"');
    assert.equal(await slotA.getByRole("button", { name: "Remover: Unidade azul, computador" }).count(), 1, 'aparece "Remover"');
    assert.equal(await focusedLabel(), "Trocar: Unidade azul, computador", "foco volta para o botão usado");
    const ratioOff = Math.abs(first.width / first.height / recommendedRatio - 1) > 0.15;
    assert.equal(await slotA.locator(".cb-warn").count(), ratioOff ? 1 : 0, "aviso de proporção só quando ela foge da recomendada");
    if (ratioOff) assert.match(await slotA.locator(".cb-warn").innerText(), /foge da recomendada/);
    pass(`envio válido pela tela (teclado): PNG ${first.width}x${first.height}, ${first.size} bytes; miniatura, largura x altura e ${ratioOff ? "aviso de proporção (sem bloquear)" : "sem aviso de proporção"}`);

    // ---------- Rota pública da imagem ----------
    res = await anon.request.get(imageUrl(first.id));
    assert.equal(res.status(), 200, "rota pública responde sem login");
    let headers = res.headers();
    assert.equal(headers["content-type"], "image/png");
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.equal(Buffer.compare(await res.body(), png), 0, "bytes servidos = bytes enviados");
    const cacheControl = headers["cache-control"];
    if (cacheControl !== LONG_CACHE) {
      late.push(`rota pública da arte responde "Cache-Control: ${cacheControl}" e deveria responder "${LONG_CACHE}": falta abrir a exceção de banner-image/ nas duas regras de /api em next.config.ts (como já existe para review-image/)`);
    }
    for (const bad of ["nao-e-um-id", "00000000-0000-4000-8000-000000000000", `${first.id}.png`]) {
      res = await anon.request.get(`${BASE}/api/checkout/banner-image/${bad}`);
      assert.equal(res.status(), 404, `id ${bad}`);
      headers = res.headers();
      assert.ok(headers["content-type"].startsWith("text/plain"), "404 limpo, em texto");
      assert.ok(headers["cache-control"].includes("no-store"), "404 sem cache");
    }
    pass(`rota da imagem: 200 público com Content-Type gravado, nosniff e os mesmos bytes; 404 limpo para id inválido ou inexistente${cacheControl === LONG_CACHE ? "; Cache-Control imutável de 1 ano" : ""}`);

    // ---------- Trocar pela tela: URL nova, a antiga sai do ar ----------
    await fileA.setInputFiles({ name: "kit-duas-unidades.jpg", mimeType: "image/jpeg", buffer: jpg });
    await slotA.locator(".af-result.is-ok", { hasText: "Arte trocada." }).waitFor();
    await page.waitForFunction(([selector, oldId]) => {
      const img = document.querySelector(selector + " .cb-thumb img");
      return Boolean(img) && !img.getAttribute("src").includes(oldId);
    }, [slotSelector("unit-azul", "desktop"), first.id]);
    rows = await slotRows("unit-azul", "desktop");
    assert.equal(rows.length, 1, "a troca não deixa duas artes no espaço");
    const second = rows[0];
    assert.notEqual(second.id, first.id, "id novo");
    assert.equal(second.mime, "image/jpeg");
    assert.equal(second.size, jpg.length);
    assert.equal((await anon.request.get(imageUrl(first.id))).status(), 404, "URL antiga passa a dar 404");
    res = await anon.request.get(imageUrl(second.id));
    assert.equal(res.status(), 200);
    assert.equal(res.headers()["content-type"], "image/jpeg");
    assert.deepEqual([...(await res.body()).subarray(0, 3)], [0xff, 0xd8, 0xff], "é JPEG de verdade");
    await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await thumb.elementHandle());
    assert.deepEqual(await thumb.evaluate((el) => [el.naturalWidth, el.naturalHeight]), [second.width, second.height], "largura e altura lidas do cabeçalho JPEG = as que o navegador lê");
    pass(`trocar pela tela: JPEG ${second.width}x${second.height} com id novo; a URL antiga dá 404 e a nova responde 200`);

    // ---------- Descrição da imagem ----------
    const altInput = slotA.getByRole("textbox", { name: "Descrição da imagem (opcional): Unidade azul, computador" });
    const saveAlt = slotA.getByRole("button", { name: "Salvar descrição: Unidade azul, computador" });
    assert.equal(await saveAlt.isDisabled(), true, "sem mudança, nada a salvar");
    assert.equal(await altInput.getAttribute("maxlength"), "120");
    assert.equal(await altInput.getAttribute("placeholder"), "Banner AquaBlast Azul");
    await altInput.fill(`  ${ALT.replace(/ /g, "   ")}  `);
    assert.equal(await saveAlt.isDisabled(), false);
    await altInput.press("Enter");
    await slotA.locator(".af-result.is-ok", { hasText: "Descrição gravada." }).waitFor();
    assert.equal(await altInput.inputValue(), ALT, "campo fica com a descrição como foi gravada (sem espaço sobrando)");
    assert.equal((await slotRows("unit-azul", "desktop"))[0].alt, ALT);
    await page.waitForFunction(([selector, alt]) => document.querySelector(selector + " .cb-thumb img")?.getAttribute("alt") === alt, [slotSelector("unit-azul", "desktop"), ALT]);
    assert.equal(await focusedLabel(), "Descrição da imagem (opcional): Unidade azul, computador", "foco fica no campo depois de gravar");
    // Trocar sem mandar descrição mantém a que já estava.
    res = await send("unit-azul", "desktop", "og-aquablast.jpg", "image/jpeg", publicFile("og-aquablast.jpg"));
    body = await res.json();
    assert.equal(res.status(), 200);
    assert.equal(body.replaced, true);
    assert.equal(body.customAlt, ALT, "a troca mantém a descrição");
    assert.equal(body.banner.alt, ALT);
    assert.notEqual(body.banner.id, second.id);
    res = await patch("unit-azul", "desktop", { alt: "x".repeat(121) });
    assert.equal(res.status(), 400, "descrição de 121 caracteres recusada");
    assert.match((await res.json()).error, /tem 121 caracteres; o limite é 120/);
    assert.equal((await patch("unit-azul", "desktop", { alt: 7 })).status(), 400, "descrição que não é texto recusada");
    assert.equal((await slotRows("unit-azul", "desktop"))[0].alt, ALT, "recusa não muda a descrição");
    res = await patch("unit-azul", "desktop", { alt: "" });
    body = await res.json();
    assert.equal(res.status(), 200);
    assert.deepEqual([body.customAlt, body.alt], ["", "Banner AquaBlast Azul"], "descrição vazia volta ao texto padrão");
    pass("descrição da imagem: gravada pelo campo (Enter), mantida na troca, limite de 120 e, vazia, volta para o texto padrão");

    // ---------- WebP pela rota, no kit (celular), com descrição ----------
    res = await send("kit", "mobile", "produto-azul.webp", "image/webp", webp, { alt: ALT_KIT });
    body = await res.json();
    assert.equal(res.status(), 200);
    assert.equal(body.replaced, false);
    const kit = body.banner;
    assert.deepEqual([kit.product, kit.device, kit.mime, kit.alt, kit.url], ["kit", "mobile", "image/webp", ALT_KIT, imagePath(kit.id)]);
    assert.deepEqual(await naturalSize(kit.url), [kit.width, kit.height], "largura e altura lidas do cabeçalho WebP = as que o navegador lê");
    res = await anon.request.get(imageUrl(kit.id));
    assert.equal(res.status(), 200);
    assert.equal(res.headers()["content-type"], "image/webp");
    res = await patch("kit", "mobile", { alt: "" });
    assert.equal((await res.json()).alt, "Banner Kit AquaBlast", "texto padrão do kit");
    assert.equal((await patch("kit", "mobile", { alt: ALT_KIT })).status(), 200);
    await page.reload();
    await block.locator(slotSelector("kit", "mobile") + '[data-filled="true"]').waitFor();
    await hydrated(page);
    assert.equal(await slotKit.locator(".cb-thumb img").getAttribute("alt"), ALT_KIT, "descrição do painel vira o texto alternativo");
    assert.equal(await slotKit.getByRole("textbox", { name: "Descrição da imagem (opcional): Kit com 2, celular e tablet" }).inputValue(), ALT_KIT);
    assert.equal(await block.locator('.cb-slot[data-filled="true"]').count() >= 2, true, "os dois espaços do roteiro aparecem com arte");
    pass(`envio pela rota: WebP ${kit.width}x${kit.height} no kit (celular), com descrição; texto padrão do kit é "Banner Kit AquaBlast"`);

    // ---------- Capturas: computador e 390 px ----------
    fs.mkdirSync(OUT, { recursive: true });
    await block.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, "31-painel-banner-1440.png") }).catch(() => {});
    const phone = await context.newPage();
    phone.on("pageerror", (err) => pageErrors.push("[390] " + String(err)));
    watchConsole(phone, "390");
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(BASE + "/admin/checkout");
    const phoneBlock = phone.locator("#banner-por-produto");
    await phoneBlock.locator(slotSelector("kit", "mobile") + '[data-filled="true"]').waitFor();
    await hydrated(phone);
    const narrow = await phone.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const outside = [...document.querySelectorAll("#banner-por-produto *")].filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -0.5 || rect.right > width + 0.5);
      });
      return { width, scroll: document.documentElement.scrollWidth, outside: outside.slice(0, 5).map((el) => el.className || el.tagName) };
    });
    assert.ok(narrow.scroll <= narrow.width, `390 px sem rolagem lateral: ${narrow.scroll} > ${narrow.width}`);
    assert.deepEqual(narrow.outside, [], "390 px: nada do bloco sai da tela");
    const small = await phoneBlock.locator("button").evaluateAll((buttons) => buttons.map((el) => Math.round(el.getBoundingClientRect().height)).filter((height) => height < 32));
    assert.deepEqual(small, [], "390 px: botões do bloco com pelo menos 32 px de altura");
    await phoneBlock.screenshot({ path: path.join(OUT, "31-painel-banner-390.png") }).catch(() => {});
    await phone.close();
    pass("390 px: o bloco cabe na tela, sem rolagem lateral");

    // ---------- "Salvar aparência" com o bloco novo na página ----------
    const storeName = await page.locator('input[name="storeName"]').inputValue();
    await page.getByRole("button", { name: "Salvar aparência" }).click();
    await page.locator(".af-result.is-ok", { hasText: "Aparência do checkout salva." }).waitFor();
    const theme = await withDb(async (c) => (await c.query("select value, updated_at from settings where key = 'checkout.theme'")).rows[0]);
    assert.ok(theme, "tema gravado");
    assert.equal(theme.value.storeName, storeName);
    assert.ok(new Date(theme.updated_at).getTime() >= startedAt - 1000, "gravado agora, por este clique");
    await block.locator(slotSelector("kit", "mobile") + '[data-filled="true"]').waitFor();
    await restoreTheme();
    pass('"Salvar aparência" grava com o bloco de banner na página (o arquivo não entra no formulário)');

    // ---------- Remover pela tela ----------
    const current = (await slotRows("unit-azul", "desktop"))[0];
    dialogs.length = 0;
    await slotA.getByRole("button", { name: "Remover: Unidade azul, computador" }).focus();
    await page.keyboard.press("Enter");
    await slotA.locator(".af-result.is-ok", { hasText: "Arte removida." }).waitFor();
    await block.locator(slotSelector("unit-azul", "desktop") + '[data-filled="false"]').waitFor();
    assert.equal(dialogs.length, 1, "pede confirmação antes de remover");
    assert.ok(dialogs[0].startsWith("Remover a arte de Unidade azul (computador)?"), "confirmação diz produto e dispositivo: " + dialogs[0]);
    assert.ok((await slotA.innerText()).includes("Sem arte"), "espaço volta a dizer Sem arte");
    assert.equal(await slotA.getByRole("button", { name: /^Remover/ }).count(), 0);
    assert.equal(await slotA.getByRole("textbox").count(), 0, "campo de descrição some junto com a arte");
    assert.equal((await slotRows("unit-azul", "desktop")).length, 0, "linha apagada");
    assert.equal((await anon.request.get(imageUrl(current.id))).status(), 404, "URL da arte removida dá 404");
    assert.equal(await focusedLabel(), "Enviar arquivo: Unidade azul, computador", "foco vai para o botão de enviar");
    res = await context.request.delete(api("kit", "mobile"), { headers: { origin: BASE } });
    assert.equal(res.status(), 200, "remoção pela rota");
    assert.equal((await anon.request.get(imageUrl(kit.id))).status(), 404);
    assert.equal((await context.request.delete(api("kit", "mobile"), { headers: { origin: BASE } })).status(), 404, "remover de novo dá 404");
    pass("remover: pede confirmação, limpa o espaço, a URL pública dá 404 e o foco vai para o botão de enviar");

    // ---------- Checkout: artes de teste no tamanho recomendado ----------
    for (const [product, device] of SLOTS) assert.equal((await slotRows(product, device)).length, 0, `espaço ${product}/${device} vazio antes do checkout`);
    /** Retângulo com o produto, o dispositivo e o tamanho escritos, desenhado e fotografado pelo próprio navegador. */
    const drawArt = async (label, [width, height]) => {
      const canvas = await context.newPage();
      await canvas.setViewportSize({ width, height });
      const edge = Math.max(4, Math.round(height / 15));
      const font = Math.round(Math.min(height * 0.4, width / 30));
      await canvas.setContent(
        `<body style="margin:0"><div style="box-sizing:border-box;width:${width}px;height:${height}px;border:${edge}px solid black;background:white;color:black;display:flex;align-items:center;justify-content:center;font:700 ${font}px Arial,sans-serif;white-space:nowrap;overflow:hidden">${label} ${width} x ${height}</div></body>`,
      );
      const buffer = await canvas.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
      await canvas.close();
      return buffer;
    };
    const sendArt = async (product, device) => {
      const size = recommended[device];
      res = await send(product, device, `${product}-${device}.png`, "image/png", await drawArt(`${product} ${device}`, size));
      body = await res.json();
      assert.equal(res.status(), 200, `arte de teste de ${product}/${device}: ${JSON.stringify(body)}`);
      assert.deepEqual([body.banner.width, body.banner.height], size, `arte de ${product}/${device} gravada no tamanho recomendado`);
      assert.equal(body.banner.url, imagePath(body.banner.id));
      return body.banner;
    };
    const arts = {
      azul: { desktop: await sendArt("unit-azul", "desktop"), mobile: await sendArt("unit-azul", "mobile") },
      kit: { desktop: await sendArt("kit", "desktop"), mobile: await sendArt("kit", "mobile") },
    };
    const ratio = { desktop: recommended.desktop[0] / recommended.desktop[1], mobile: recommended.mobile[0] / recommended.mobile[1] };

    /** Checkout num navegador sem login do painel, com o preparo de _lib.open (consentimento respondido, ViaCEP simulado). */
    const openCheckout = async (options, tag) => {
      const opened = await L.open(options);
      checkoutBrowsers.push(opened.browser);
      opened.context.setDefaultTimeout(45000);
      opened.page.on("pageerror", (err) => pageErrors.push(`[${tag}] ${String(err)}`));
      watchConsole(opened.page, tag);
      return opened;
    };
    /** Abre o checkout com a query e espera o React assumir. Devolve a posição da lista de requisições antes da visita. */
    const visit = async (opened, query) => {
      const from = opened.requests.length;
      await L.goCheckout(opened.page, query);
      await hydrated(opened.page, CHECKOUT_FIELD);
      return from;
    };
    const requested = async (opened, from, match) => {
      await opened.page.waitForTimeout(400);
      return [...new Set(opened.requests.slice(from).map((request) => decodeURIComponent(request.url.replace(BASE, ""))).filter(match))];
    };
    /** Artes do painel pedidas pela página desde `from`. */
    const artRequests = (opened, from) => requested(opened, from, (url) => url.startsWith(BANNER_IMAGE));
    /** Foto de produto do banner de texto (miniatura de 610 px) pedida pela página desde `from`. */
    const textPhotoRequests = (opened, from) => requested(opened, from, (url) => url.includes("-610."));
    const bannerState = (target) =>
      target.evaluate((field) => {
        const round = (n) => Math.round(n * 10) / 10;
        const drawn = (el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const viewport = [document.documentElement.clientWidth, window.innerHeight];
        const banner = document.querySelector(".campaign");
        const name = document.querySelector(field);
        const nameY = name ? round(name.getBoundingClientRect().y) : null;
        if (!banner) return { present: false, shown: false, nameY, viewport };
        const box = banner.getBoundingClientRect();
        const shown = drawn(banner);
        return {
          present: true,
          shown,
          product: banner.dataset.bannerProduct,
          box: [box.x, box.y, box.width, box.height].map(round),
          // innerText de elemento escondido devolve o texto cru: só vale ler quando o banner aparece.
          text: shown ? banner.innerText.replace(/\s+/g, " ").trim() : "",
          blocks: [".campaign-copy", ".campaign-products", ".campaign-benefit"].filter((css) => [...banner.querySelectorAll(css)].some(drawn)),
          images: [...banner.querySelectorAll("img")].filter(drawn).map((img) => {
            const rect = img.getBoundingClientRect();
            return { src: img.getAttribute("src"), alt: img.alt, natural: [img.naturalWidth, img.naturalHeight], box: [rect.x, rect.y, rect.width, rect.height].map(round), fit: getComputedStyle(img).objectFit };
          }),
          nameY,
          viewport,
          scroll: document.documentElement.scrollWidth,
        };
      }, CHECKOUT_FIELD);
    /** O banner é só a arte esperada: o arquivo enviado, inteiro (nunca cortado), na caixa do banner, sem nada do banner de texto. */
    const expectArt = async (target, art, product, label) => {
      await target
        .waitForFunction(([url, wanted]) => {
          const banner = document.querySelector(".campaign");
          if (!banner || banner.dataset.bannerProduct !== wanted) return false;
          const shown = [...banner.querySelectorAll("img")].filter((img) => img.getBoundingClientRect().width > 0);
          return shown.length === 1 && shown[0].getAttribute("src") === url && shown[0].complete && shown[0].naturalWidth > 0;
        }, [art.url, product])
        .catch(async () => {
          throw new Error(`${label}: a arte esperada (${art.url}) não apareceu: ${JSON.stringify(await bannerState(target))}`);
        });
      const state = await bannerState(target);
      assert.equal(state.shown, true, `${label}: o banner aparece`);
      assert.equal(state.product, product, `${label}: produto do banner`);
      assert.equal(state.images.length, 1, `${label}: uma imagem só no banner`);
      const [image] = state.images;
      assert.equal(image.src, art.url, `${label}: a imagem é a arte enviada no painel`);
      assert.equal(image.alt, art.alt, `${label}: texto alternativo da arte`);
      assert.deepEqual(image.natural, [art.width, art.height], `${label}: arquivo como foi enviado`);
      assert.equal(image.fit, "contain", `${label}: arte inteira, nunca cortada`);
      assert.deepEqual(image.box, state.box, `${label}: a arte ocupa a caixa do banner`);
      assert.equal(state.text, "", `${label}: nenhum texto do banner antigo`);
      assert.deepEqual(state.blocks, [], `${label}: sem chamada, fotos de produto nem bloco de frete`);
      assert.ok(state.scroll <= state.viewport[0], `${label}: sem rolagem lateral (${state.scroll} > ${state.viewport[0]})`);
      return state;
    };
    /** Sem arte para a faixa: o banner de texto, com a chamada, o produto e o bloco de frete, e nenhuma arte do painel. */
    const expectTextBanner = async (target, product, label) => {
      await target.waitForFunction((wanted) => document.querySelector(".campaign")?.dataset.bannerProduct === wanted, product);
      const state = await bannerState(target);
      assert.equal(state.shown, true, `${label}: o banner de texto aparece`);
      assert.deepEqual(state.blocks, [".campaign-copy", ".campaign-products", ".campaign-benefit"], `${label}: chamada, produto e bloco de frete`);
      assert.match(state.text, /FRETE GRÁTIS/, `${label}: bloco de frete do banner de texto`);
      assert.deepEqual(state.images.filter((image) => image.src.startsWith(BANNER_IMAGE)), [], `${label}: nenhuma arte do painel`);
      return state;
    };
    /** Troca a cor da unidade pelo "Alterar cores" do resumo, como o cliente faz, sem sair da página. */
    const pickColor = async (target, color) => {
      const editor = target.locator("details.ck-summary-color-editor:visible").first();
      if (!(await editor.evaluate((el) => el.open))) await editor.locator("summary").click();
      await editor.locator(`input[name="ck-color-0"][value="${color}"]`).check({ force: true });
    };
    const samePage = (target) => target.evaluate(() => window.__e2e31);

    // ---------- Checkout no computador (1100 px ou mais): arte de computador do produto ----------
    const desk = await openCheckout({ width: 1440, height: 900 }, "checkout-1440");
    let from = await visit(desk, "pack=unit&cor=azul");
    const azulDesk = await expectArt(desk.page, arts.azul.desktop, "unit-azul", "1440 px, ?cor=azul");
    assert.ok(Math.abs(azulDesk.box[2] / azulDesk.box[3] - ratio.desktop) < 0.01, `1440 px: caixa na proporção recomendada do computador: ${azulDesk.box}`);
    assert.deepEqual(await artRequests(desk, from), [arts.azul.desktop.url], "computador pede só a arte de computador do produto");
    assert.deepEqual(await textPhotoRequests(desk, from), [], "computador com arte não baixa a foto do banner de texto");
    await desk.page.screenshot({ path: path.join(OUT, "31-checkout-banner-1440.png") }).catch(() => {});
    pass(`checkout a 1440 px, ?cor=azul: só a arte de computador (${arts.azul.desktop.width} x ${arts.azul.desktop.height}) na caixa de ${azulDesk.box[2]} x ${azulDesk.box[3]} px, inteira, sem texto do banner antigo; a arte de celular não é pedida`);

    // Trocar de cor na própria página: sem arte volta o banner de texto na mesma caixa; de volta ao azul, a arte.
    await desk.page.evaluate(() => {
      window.__e2e31 = "mesma página";
    });
    await pickColor(desk.page, "preto");
    const pretoSwitched = await expectTextBanner(desk.page, "unit-preto", "1440 px, cor trocada para preto");
    assert.deepEqual(pretoSwitched.box, azulDesk.box, "computador: mesma caixa com a arte e com o banner de texto (sem pulo de layout)");
    assert.equal(pretoSwitched.nameY, azulDesk.nameY, "computador: o formulário não sai do lugar na troca de cor");
    await pickColor(desk.page, "azul");
    const azulAgain = await expectArt(desk.page, arts.azul.desktop, "unit-azul", "1440 px, cor trocada de volta para azul");
    assert.deepEqual([azulAgain.box, azulAgain.nameY], [azulDesk.box, azulDesk.nameY], "computador: caixa e formulário no mesmo lugar depois de voltar para o azul");
    assert.equal(await samePage(desk.page), "mesma página", "a troca de cor não recarrega a página");
    pass("checkout a 1440 px: trocar de cor troca a arte sem recarregar; com e sem arte a caixa do banner e o formulário ficam no mesmo lugar");

    from = await visit(desk, "pack=kit&cor1=azul&cor2=preto");
    await expectArt(desk.page, arts.kit.desktop, "kit", "1440 px, kit");
    assert.deepEqual(await artRequests(desk, from), [arts.kit.desktop.url], "kit no computador pede só a arte de computador do kit");
    pass("checkout a 1440 px, kit: a arte de computador do kit");

    from = await visit(desk, "pack=unit&cor=preto");
    const pretoDesk = await expectTextBanner(desk.page, "unit-preto", "1440 px, ?cor=preto (sem arte)");
    assert.deepEqual(pretoDesk.box, azulDesk.box, "computador: o banner de texto ocupa a mesma caixa da arte");
    assert.deepEqual(await artRequests(desk, from), [], "produto sem arte não pede arte nenhuma");
    assert.ok(pretoDesk.images.some((image) => decodeURIComponent(image.src).includes("-610.")), "o banner de texto mostra a foto do produto (miniatura de 610 px)");
    pass("checkout a 1440 px, ?cor=preto (sem arte): o banner de texto de sempre, na mesma caixa");

    // ---------- Etapas 2 e 3 sem banner; a segunda unidade aceita troca para a arte do kit ----------
    await L.clearRateLimits();
    await desk.page.evaluate(() => {
      window.__e2e31 = "mesma página";
    });
    from = desk.requests.length;
    await L.fillDados(desk.page);
    await L.submitDados(desk.page);
    assert.equal(await desk.page.locator(".campaign").count(), 0, "etapa 2 (entrega) sem banner");
    await L.fillEntrega(desk.page);
    await L.submitEntrega(desk.page);
    assert.equal(await desk.page.locator(".campaign").count(), 0, "etapa 3 (pagamento) sem banner");
    await desk.page.locator(".bump-open-trigger").click();
    await L.waitText(desk.page.locator(".bump-choice"), "ESCOLHA SUA SEGUNDA UNIDADE");
    await desk.page.locator('input[name="bump-color"][value="azul"]').check();
    await L.btn(desk.page, "Selecionar segunda unidade com desconto").click();
    await L.waitText(desk.page.locator(".bump-choice"), "SEGUNDA UNIDADE SELECIONADA");
    await L.editStep(desk.page, "Editar seus dados").click();
    await desk.page.locator(CHECKOUT_FIELD).waitFor();
    const bumped = await expectArt(desk.page, arts.kit.desktop, "kit", "1440 px, unidade preta com a segunda unidade aceita");
    assert.deepEqual(bumped.box, azulDesk.box, "computador: a arte do kit entra na mesma caixa");
    // A arte do kit já foi baixada nesta janela (visita ao kit): pode vir do cache, sem pedido novo. O que não pode é outra arte.
    assert.deepEqual((await artRequests(desk, from)).filter((url) => url !== arts.kit.desktop.url), [], "a segunda unidade não pede nenhuma arte além da de computador do kit");
    assert.equal(await samePage(desk.page), "mesma página", "aceitar a segunda unidade e voltar à etapa 1 não recarrega a página");
    pass("checkout: etapas 2 e 3 sem banner; aceitar a segunda unidade troca o banner de texto da unidade preta pela arte do kit, sem recarregar");

    // ---------- Checkout no tablet (768 a 1099 px): arte de celular e tablet, com a altura limitada ----------
    const tablet = await openCheckout({ width: 820, height: 1180 }, "checkout-820");
    from = await visit(tablet, "pack=unit&cor=azul");
    const azulTablet = await expectArt(tablet.page, arts.azul.mobile, "unit-azul", "820 px, ?cor=azul");
    assert.ok(Math.abs(azulTablet.box[2] / azulTablet.box[3] - ratio.mobile) < 0.01, `820 px: caixa na proporção recomendada do celular e tablet: ${azulTablet.box}`);
    assert.deepEqual(await artRequests(tablet, from), [arts.azul.mobile.url], "tablet pede só a arte de celular e tablet do produto");
    from = await visit(tablet, "pack=unit&cor=preto");
    const pretoTablet = await expectTextBanner(tablet.page, "unit-preto", "820 px, ?cor=preto (sem arte)");
    assert.deepEqual(await artRequests(tablet, from), [], "tablet sem arte não pede arte nenhuma");
    // Prova de que o roteiro enxerga o pedido da foto do banner de texto; é o que não pode aparecer no celular sem arte.
    assert.ok((await textPhotoRequests(tablet, from)).length > 0, "tablet sem arte baixa a foto do produto do banner de texto");
    assert.ok(azulTablet.box[3] <= pretoTablet.box[3] + 0.5, `tablet: a arte (${azulTablet.box[3]} px) não fica mais alta que o banner de texto dessa faixa (${pretoTablet.box[3]} px)`);
    pass(`checkout a 820 px: com arte, a de celular e tablet em ${azulTablet.box[2]} x ${azulTablet.box[3]} px (a de computador não é pedida); sem arte, o banner de texto (${pretoTablet.box[2]} x ${pretoTablet.box[3]} px)`);

    // ---------- Checkout no celular (abaixo de 768 px): arte de celular na largura inteira; sem arte, nenhum banner ----------
    const handset = await openCheckout({ width: 390, height: 844, mobile: true }, "checkout-390");
    from = await visit(handset, "pack=unit&cor=azul");
    const azulPhone = await expectArt(handset.page, arts.azul.mobile, "unit-azul", "390 px, ?cor=azul");
    assert.deepEqual([azulPhone.box[0], azulPhone.box[2]], [0, azulPhone.viewport[0]], "390 px: a arte ocupa a largura inteira da tela");
    assert.ok(Math.abs(azulPhone.box[3] - azulPhone.box[2] / ratio.mobile) <= 0.5, `390 px: altura da caixa pela proporção recomendada: ${azulPhone.box}`);
    assert.deepEqual(await artRequests(handset, from), [arts.azul.mobile.url], "celular pede só a arte de celular do produto");
    await handset.page.screenshot({ path: path.join(OUT, "31-checkout-banner-390.png") }).catch(() => {});
    from = await visit(handset, "pack=kit&cor1=azul&cor2=preto");
    await expectArt(handset.page, arts.kit.mobile, "kit", "390 px, kit");
    assert.deepEqual(await artRequests(handset, from), [arts.kit.mobile.url], "kit no celular pede só a arte de celular do kit");
    from = await visit(handset, "pack=unit&cor=preto");
    await handset.page.waitForFunction(() => document.querySelector(".campaign")?.dataset.bannerProduct === "unit-preto");
    const pretoPhone = await bannerState(handset.page);
    assert.equal(pretoPhone.shown, false, "390 px sem arte: nenhum banner");
    assert.deepEqual(await artRequests(handset, from), [], "celular sem arte não pede arte nenhuma");
    assert.deepEqual(await textPhotoRequests(handset, from), [], "celular sem arte não baixa a foto do banner de texto, que não aparece");
    pass(`checkout a 390 px: a arte de celular em ${azulPhone.box[2]} x ${azulPhone.box[3]} px, na largura inteira (a de computador não é pedida); kit com a arte do kit; sem arte, nenhum banner e nenhuma imagem dele baixada`);

    assert.deepEqual(pageErrors, [], "sem erro de JavaScript no painel nem no checkout");
    assert.deepEqual(consoleErrors, [], "sem erro do React ou do Next no console do painel nem do checkout");
    await anon.close();
  } finally {
    try {
      for (const extra of checkoutBrowsers) await extra.close().catch(() => {});
      await browser.close();
    } finally {
      await restore();
    }
  }

  const left = await withDb(async (c) => {
    const found = [];
    for (const [product, device] of SLOTS) found.push(...(await c.query("select id from checkout_banners where product = $1 and device = $2", [product, device])).rows);
    const theme = (await c.query("select updated_at from settings where key = 'checkout.theme'")).rows[0] ?? null;
    return { ids: found.map((row) => row.id).sort(), theme };
  });
  assert.deepEqual(left.ids, savedArt.map((row) => row.id).sort(), "nos espaços do roteiro sobra só o que já estava antes");
  assert.equal(left.theme ? new Date(left.theme.updated_at).getTime() : null, savedTheme ? new Date(savedTheme.updated_at).getTime() : null, "tema como estava antes");
  pass(`banco no fim: nenhuma arte de teste (${savedArt.length} arte(s) anterior(es) devolvida(s)) e tema como estava`);

  if (late.length) {
    for (const text of late) console.log("[FALHOU] " + text);
    throw new Error(`${late.length} verificação(ões) falharam (o resto do roteiro rodou e a limpeza foi feita).`);
  }
  console.log(`\nPASS: ${steps.length} verificações.`);
})().catch((err) => {
  console.error("FAIL: " + (err && err.stack ? err.stack : err));
  process.exitCode = 1;
});
