/* eslint-disable @typescript-eslint/no-require-imports */
// Comentários do checkout cadastrados pelo painel (/admin/checkout/comentarios), com foto.
// Cobre: cadastrar com foto, ver no checkout (1440), ampliar a foto, desativar e ver sumir, arquivo que
// não é imagem recusado, foto grande recusada com a mensagem certa e os cabeçalhos da rota da imagem.
// A foto de teste é um PNG gerado aqui mesmo. No fim sobram só os dois comentários semeados.
// Rodar: NODE_PATH="$(npm root -g)" node e2e/28-comentarios-checkout.cjs
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { chromium } = require("playwright");
const { withDb } = require("./_db.cjs");

const BASE = process.env.E2E_BASE || "http://localhost:3100";
const AUTHOR = `Teste e2e ${Date.now()}`;
const COMMENT = "Comentário de teste do roteiro e2e 28. Apagado no fim.";
const SEEDED = ["carlos.dutra", "elciobach722"];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
}
/** PNG RGB de verdade. `noise` deixa o arquivo grande (pixels aleatórios, sem compressão). */
function makePng(width, height, { noise = false } = {}) {
  const row = 1 + width * 3;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * row + 1 + x * 3;
      if (noise) {
        raw[i] = (Math.random() * 256) | 0;
        raw[i + 1] = (Math.random() * 256) | 0;
        raw[i + 2] = (Math.random() * 256) | 0;
      } else {
        raw[i] = 20 + Math.round((x / width) * 200);
        raw[i + 1] = 120;
        raw[i + 2] = 220 - Math.round((y / height) * 180);
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: noise ? 0 : 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const steps = [];
function pass(text) {
  steps.push(text);
  console.log("ok  " + text);
}

async function cleanup() {
  await withDb((c) => c.query("delete from checkout_reviews where author like 'Teste e2e %'"));
}

(async () => {
  await cleanup();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  // Excluir comentário e remover foto pedem confirmação (window.confirm, padrão do painel).
  page.on("dialog", (dialog) => dialog.accept());

  try {
    // ---------- Painel: entrar e abrir a tela ----------
    await page.goto(BASE + "/admin/login");
    await page.getByRole("button", { name: /Entrada r[aá]pida/i }).click();
    await page.waitForURL(/\/admin(?!\/login)/);
    await page.goto(BASE + "/admin/checkout/comentarios");
    await page.getByRole("heading", { name: "Comentários do checkout" }).waitFor();
    for (const author of SEEDED) assert.equal(await page.locator(".cr-item", { hasText: author }).count(), 1, `semeado ${author} na lista`);
    assert.ok(await page.getByText("Foto gerada por IA não entra como depoimento").isVisible(), "aviso fixo de honestidade");
    assert.ok(await page.getByRole("link", { name: "Comentários", exact: true }).isVisible(), "item no menu");
    pass("painel abre, lista os dois semeados, mostra o aviso e o item do menu");

    // ---------- Cadastrar ----------
    await page.locator('input[name="author"]').fill(AUTHOR);
    await page.locator('select[name="score"]').selectOption("4");
    await page.locator('textarea[name="comment"]').fill(COMMENT);
    await page.getByRole("button", { name: "Adicionar comentário" }).click();
    await page.waitForURL(/editar=[0-9a-f-]{36}/);
    const reviewId = new URL(page.url()).searchParams.get("editar");
    await page.getByRole("heading", { name: "Fotos do cliente" }).waitFor();
    assert.equal(await page.locator(`.cr-item[data-review-id="${reviewId}"]`).count(), 1, "comentário novo na lista");
    pass("comentário cadastrado e aberto em edição");

    // ---------- Arquivo que não é imagem: recusado na tela ----------
    const fileInput = page.locator('.cr-photos input[type="file"]');
    await fileInput.setInputFiles({ name: "nota.png", mimeType: "image/png", buffer: Buffer.from("isto nao e uma imagem, e so texto") });
    await page.locator(".cr-photos .af-result.is-err", { hasText: "não é uma foto JPEG, PNG ou WebP" }).waitFor();
    assert.equal(await page.locator(".cr-pending").count(), 0, "sem prévia para arquivo recusado");
    pass("tela recusa arquivo que não é imagem, com a causa");

    // ---------- Enviar a foto pela tela (reduz no navegador, mostra prévia) ----------
    await fileInput.setInputFiles({ name: "cliente.png", mimeType: "image/png", buffer: makePng(1600, 1000) });
    await page.locator(".cr-pending").waitFor();
    const previewText = await page.locator(".cr-pending p").innerText();
    assert.match(previewText, /1200 x 750 px/, "prévia reduzida para 1200 px no lado maior: " + previewText);
    await page.getByRole("button", { name: "Enviar foto" }).click();
    await page.locator(".cr-photos .af-result.is-ok", { hasText: "Foto enviada." }).waitFor();
    await page.locator(".cr-photo-list li").first().waitFor();
    const stored = await withDb(async (c) => (await c.query("select id, mime, width, height, octet_length(bytes) as size from checkout_review_images where review_id = $1", [reviewId])).rows);
    assert.equal(stored.length, 1, "uma foto gravada");
    assert.equal(stored[0].mime, "image/jpeg");
    assert.equal(stored[0].width, 1200);
    assert.equal(stored[0].height, 750);
    const imageId = stored[0].id;
    await page.locator(`.cr-item[data-review-id="${reviewId}"] .cr-thumb img`).waitFor();
    assert.ok(await page.locator(".cr-preview figure", { hasText: AUTHOR }).locator(".cr-thumb img").count(), "foto na prévia do painel");
    pass(`foto enviada pela tela: JPEG 1200x750, ${stored[0].size} bytes no banco, miniatura na lista e na prévia`);

    // ---------- Servidor: recusas com a mensagem certa ----------
    const uploadUrl = `${BASE}/api/admin/checkout-reviews/${reviewId}/images`;
    const send = (name, mimeType, buffer) => context.request.post(uploadUrl, { headers: { origin: BASE }, multipart: { file: { name, mimeType, buffer } } });

    let res = await send("foto.png", "image/png", Buffer.from("texto puro fingindo ser png"));
    let body = await res.json();
    assert.equal(res.status(), 400);
    assert.match(body.error, /não é uma foto JPEG, PNG ou WebP/);

    res = await send("vetor.svg", "image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    body = await res.json();
    assert.equal(res.status(), 400, "SVG recusado");
    assert.match(body.error, /não é uma foto JPEG, PNG ou WebP/);
    pass("servidor recusa texto com nome de PNG e SVG (confere os bytes, não o tipo declarado)");

    const big = makePng(1000, 1000, { noise: true });
    assert.ok(big.length > 2 * 1024 * 1024, "PNG de teste passa de 2 MB");
    res = await send("grande.png", "image/png", big);
    body = await res.json();
    assert.equal(res.status(), 413);
    const expected = `A foto tem ${(big.length / (1024 * 1024)).toFixed(1).replace(".", ",")} MB; o limite é 2 MB.`;
    assert.ok(body.error.startsWith(expected), `mensagem da foto grande: "${body.error}" (esperado começar com "${expected}")`);
    pass(`servidor recusa foto grande: "${body.error}"`);

    res = await context.request.post(uploadUrl, { headers: { origin: "https://outro-site.example" }, multipart: { file: { name: "a.png", mimeType: "image/png", buffer: makePng(40, 40) } } });
    assert.equal(res.status(), 403, "origem de fora recusada");
    const anon = await browser.newContext();
    res = await anon.request.post(uploadUrl, { headers: { origin: BASE }, multipart: { file: { name: "a.png", mimeType: "image/png", buffer: makePng(40, 40) } } });
    assert.equal(res.status(), 401, "sem login recusado");
    pass("envio exige login do painel (401) e origem do próprio site (403)");

    // Limite de 3 fotos: mais duas entram (PNG direto), a quarta é recusada.
    for (let i = 0; i < 2; i += 1) assert.equal((await send(`extra${i}.png`, "image/png", makePng(300, 200))).status(), 200, "foto extra aceita");
    res = await send("quarta.png", "image/png", makePng(300, 200));
    body = await res.json();
    assert.equal(res.status(), 409);
    assert.match(body.error, /já tem 3 fotos/);
    const dims = await withDb(async (c) => (await c.query("select mime, width, height from checkout_review_images where review_id = $1 order by position", [reviewId])).rows);
    assert.deepEqual(dims.map((d) => `${d.mime} ${d.width}x${d.height}`), ["image/jpeg 1200x750", "image/png 300x200", "image/png 300x200"], "largura e altura lidas do cabeçalho");
    pass("limite de 3 fotos por comentário; largura e altura lidas do cabeçalho (JPEG e PNG)");

    // ---------- Rota pública da imagem ----------
    const imageUrl = `${BASE}/api/checkout/review-image/${imageId}`;
    res = await anon.request.get(imageUrl);
    assert.equal(res.status(), 200);
    const headers = res.headers();
    assert.equal(headers["content-type"], "image/jpeg");
    assert.equal(headers["cache-control"], "public, max-age=31536000, immutable", "cache-control: " + headers["cache-control"]);
    assert.equal(headers["x-content-type-options"], "nosniff");
    const served = await res.body();
    assert.equal(served.length, Number(stored[0].size), "bytes servidos = bytes gravados");
    assert.deepEqual([...served.subarray(0, 3)], [0xff, 0xd8, 0xff], "é JPEG de verdade");
    assert.equal((await anon.request.get(`${BASE}/api/checkout/review-image/nao-e-um-id`)).status(), 404);
    assert.equal((await anon.request.get(`${BASE}/api/checkout/review-image/00000000-0000-4000-8000-000000000000`)).status(), 404);
    pass("rota da imagem: 200 público com Content-Type, Cache-Control imutável de 1 ano e nosniff; 404 para id inválido ou inexistente");

    // ---------- Checkout em 1440 ----------
    const shop = await anon.newPage();
    await shop.setViewportSize({ width: 1440, height: 900 });
    const shopErrors = [];
    shop.on("pageerror", (err) => shopErrors.push(String(err)));
    await shop.goto(BASE + "/checkout?pack=unit&cor=azul");
    const block = shop.locator("section.ck-reference-reviews");
    await block.waitFor({ state: "attached" });
    const figure = block.locator("figure", { hasText: AUTHOR });
    assert.equal(await figure.count(), 1, "comentário novo no checkout");
    assert.equal(await figure.locator("blockquote").innerText(), COMMENT);
    assert.equal(await figure.locator(".ck-review-stars svg").count(), 4, "4 estrelas");
    assert.equal((await figure.locator("figcaption span").innerText()).trim(), "T", "avatar = primeira letra em maiúscula");
    for (const author of SEEDED) assert.equal(await block.locator("figure", { hasText: author }).count(), 1, `semeado ${author} no checkout`);
    const order = await block.locator("figcaption").allInnerTexts();
    assert.ok(order[0].includes("carlos.dutra") && order[1].includes("elciobach722"), "ordem do painel respeitada: " + order.join(" | "));
    const thumbs = figure.locator("button img");
    assert.equal(await thumbs.count(), 3, "3 miniaturas");
    assert.equal(await thumbs.first().getAttribute("alt"), `Foto enviada por ${AUTHOR}`);
    const thumbButton = figure.locator("button").first();
    await thumbButton.scrollIntoViewIfNeeded();
    const box = await thumbButton.boundingBox();
    assert.ok(box && box.width <= 56.5 && Math.abs(box.width - box.height) < 1, `miniatura quadrada de até 56 px: ${box && box.width}x${box && box.height}`);
    await shop.waitForFunction((el) => el.complete && el.naturalWidth > 0, await thumbs.first().elementHandle());
    pass("checkout 1440: comentário novo com nota, texto, avatar e 3 miniaturas de 56 px carregadas; semeados na ordem");

    const dialog = block.locator("dialog");
    const isOpen = () => dialog.evaluate((el) => el.open);
    await thumbButton.click();
    assert.equal(await isOpen(), true, "dialog abre");
    const bigImage = dialog.locator("img");
    await shop.waitForFunction((el) => el.complete && el.naturalWidth > 0, await bigImage.elementHandle());
    assert.equal(await bigImage.getAttribute("alt"), `Foto enviada por ${AUTHOR}`);
    const fits = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const centered = Math.abs(r.left - (window.innerWidth - r.right)) < 2 && Math.abs(r.top - (window.innerHeight - r.bottom)) < 2;
      return centered && r.left >= 0 && r.top >= 0 && r.width > 300;
    });
    assert.ok(fits, "foto ampliada cabe na tela, centralizada");
    await shop.screenshot({ path: require("node:path").join(__dirname, "out", "28-checkout-foto-ampliada.png") }).catch(() => {});
    await shop.keyboard.press("Escape");
    assert.equal(await isOpen(), false, "Esc fecha");
    assert.equal(await thumbButton.evaluate((el) => el === document.activeElement), true, "foco volta para a miniatura (Esc)");
    await thumbButton.click();
    await dialog.getByRole("button", { name: "Fechar" }).click();
    assert.equal(await isOpen(), false, "botão Fechar fecha");
    assert.equal(await thumbButton.evaluate((el) => el === document.activeElement), true, "foco volta para a miniatura (Fechar)");
    await thumbButton.click();
    await shop.mouse.click(1425, 450);
    assert.equal(await isOpen(), false, "clique fora fecha");
    assert.equal(await thumbButton.evaluate((el) => el === document.activeElement), true, "foco volta para a miniatura (clique fora)");
    assert.deepEqual(shopErrors, [], "sem erro de JavaScript no checkout");
    pass("foto ampliada em <dialog>: fecha com Esc, botão Fechar e clique fora; foco volta para a miniatura");

    // ---------- Desativar: some do checkout e a foto sai do ar ----------
    const item = page.locator(`.cr-item[data-review-id="${reviewId}"]`);
    await item.getByRole("button", { name: "Desativar" }).click();
    await page.locator(`.cr-item[data-review-id="${reviewId}"][data-active="false"]`).waitFor();
    assert.ok(await item.locator(".cr-thumb img").count(), "painel continua mostrando a foto do desativado");
    await shop.goto(BASE + "/checkout?pack=unit&cor=azul");
    await shop.locator("section.ck-reference-reviews").waitFor({ state: "attached" });
    assert.equal(await shop.locator("section.ck-reference-reviews figure", { hasText: AUTHOR }).count(), 0, "desativado some do checkout");
    assert.equal(await shop.locator("section.ck-reference-reviews figure").count(), 2, "ficam os dois semeados");
    assert.equal((await anon.request.get(imageUrl)).status(), 404, "foto de comentário desativado não é servida");
    pass("desativado: some do checkout e a rota pública da foto passa a dar 404");

    // ---------- Remover foto e excluir pelo painel ----------
    await page.goto(`${BASE}/admin/checkout/comentarios?editar=${reviewId}`);
    await page.locator(".cr-photo-list li").first().getByRole("button", { name: "Remover" }).click();
    await page.locator(".cr-photos .af-result.is-ok", { hasText: "Foto removida." }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll(".cr-photo-list li").length === 2);
    await page.locator(`.cr-item[data-review-id="${reviewId}"]`).getByRole("button", { name: "Excluir" }).click();
    await page.waitForFunction((id) => !document.querySelector(`.cr-item[data-review-id="${id}"]`), reviewId);
    pass("foto removida e comentário excluído pelo painel (com confirmação)");

    assert.deepEqual(pageErrors, [], "sem erro de JavaScript no painel");
    await anon.close();
  } finally {
    await browser.close();
    await cleanup();
  }

  const left = await withDb(async (c) => ({
    reviews: (await c.query("select author, score, comment, active from checkout_reviews order by position")).rows,
    images: Number((await c.query("select count(*) as n from checkout_review_images")).rows[0].n),
  }));
  assert.deepEqual(left.reviews.map((r) => r.author), SEEDED, "sobram só os dois semeados");
  assert.ok(left.reviews.every((r) => r.active && r.score === 5), "semeados ativos, nota 5");
  assert.equal(left.images, 0, "nenhuma foto de teste sobrou");
  pass("banco no fim: só os dois comentários semeados, sem foto");
  console.log(`\nPASS: ${steps.length} verificações.`);
})().catch((err) => {
  console.error("FAIL: " + (err && err.stack ? err.stack : err));
  process.exitCode = 1;
});
