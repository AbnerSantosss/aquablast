/* eslint-disable @typescript-eslint/no-require-imports */
// 21 - App do painel (PWA) + aviso de venda por Web Push (pedido 2026-09-30-pwa-aviso-de-venda, Agente A).
// Alvo: dev em http://localhost:3100 + banco local. Nao chama nenhum servico de push real: o "servico de push"
// e um servidor http local (127.0.0.1) que so guarda o corpo. Em producao o envio exige https (endpointAllowed).
// Rodar: NODE_PATH="$(npm root -g)" node e2e/21-app-vendas.cjs
//
// Cenarios:
//  21a. webpush-crypto.ts (transpilado): vetor do RFC 8291 (apendice A) + ida e volta com chave de cliente gerada aqui,
//       decifrada por uma implementacao independente (HMAC na mao); JWT VAPID ES256 confere com a chave publica.
//  21b. Rotas exigem login: sales/recent, push/public-key, push/test e push/subscribe -> 401 sem sessao.
//  21c. Manifest do app valido (PWABuilder/TWA): campos, escopo, icones 192/512/maskable existem (200, PNG).
//  21d. /admin/app em 360px: sem rolagem lateral, botoes, lista de vendas, manifest no <head>, SW registrado em /admin.
//  21e. Push ponta a ponta: inscricao falsa (POST subscribe) -> "Testar aviso" -> servidor local recebe 201,
//       corpo aes128gcm decifra para o JSON do teste, headers VAPID/TTL/Urgency certos.
//  21f. Endpoint que devolve 410 -> inscricao apagada do banco.
// No fim apaga as inscricoes de teste (endpoint 127.0.0.1).
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const L = require("./_lib.cjs");
const { assert, withDb } = L;

const ORIGIN = { origin: L.BASE, "content-type": "application/json" };
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function loadCrypto() {
  const ts = require(path.join(__dirname, "..", "node_modules", "typescript"));
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "push", "webpush-crypto.ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, (id) => require(id.replace(/^node:/, "")));
  return mod.exports;
}

/** HKDF-SHA256 escrito aqui com HMAC (independente do hkdfSync usado no codigo). Um bloco basta (<= 32 bytes). */
function hkdf(salt, ikm, info, len) {
  const prk = crypto.createHmac("sha256", salt).update(ikm).digest();
  return crypto.createHmac("sha256", prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);
}

/** Decifra um corpo aes128gcm (RFC 8188/8291) com a chave privada do cliente. Devolve o payload. */
function decryptPush(body, client, authSecret) {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const record = body.subarray(21 + idlen);
  assert.equal(rs, 4096, "rs diferente de 4096");
  assert.equal(idlen, 65, "keyid nao e a chave publica P-256 (65 bytes)");
  assert.ok(record.length <= rs, "registro maior que rs");
  const uaPublic = client.getPublicKey();
  const secret = client.computeSecret(asPublic);
  const ikm = hkdf(authSecret, secret, Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(record.subarray(record.length - 16));
  let plain = Buffer.concat([d.update(record.subarray(0, record.length - 16)), d.final()]);
  let end = plain.length;
  while (end > 0 && plain[end - 1] === 0) end--;
  assert.equal(plain[end - 1], 0x02, "delimitador do ultimo registro (0x02) ausente");
  plain = plain.subarray(0, end - 1);
  return plain;
}

/** Confere o `Authorization: vapid t=<jwt>, k=<pub>` com a chave publica. Devolve as claims. */
function verifyVapid(authorization, expectedPub, endpoint) {
  const m = /^vapid t=([^,\s]+),\s*k=([A-Za-z0-9_-]+)$/.exec(authorization || "");
  assert.ok(m, `Authorization fora do formato vapid: ${String(authorization).slice(0, 40)}`);
  const [, jwt, k] = m;
  if (expectedPub) assert.equal(k, expectedPub, "k= diferente da chave publica do servidor");
  const [h, p, s] = jwt.split(".");
  const header = JSON.parse(unb64u(h).toString());
  const claims = JSON.parse(unb64u(p).toString());
  assert.equal(header.alg, "ES256");
  const pub = unb64u(k);
  const key = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
  const ok = crypto.verify("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }, unb64u(s));
  assert.ok(ok, "assinatura ES256 do JWT VAPID nao confere");
  assert.equal(claims.aud, new URL(endpoint).origin, "aud diferente do origin do endpoint");
  const now = Math.floor(Date.now() / 1000);
  assert.ok(claims.exp > now && claims.exp <= now + 24 * 3600, `exp fora de (agora, agora+24h]: ${claims.exp}`);
  assert.ok(/^(mailto:|https:\/\/)/.test(claims.sub || ""), `sub invalido: ${claims.sub}`);
  return claims;
}

/** "Servico de push" local: grava cada POST e responde com o status configurado para o caminho. */
function startFakePush() {
  const hits = [];
  const statusFor = (url) => (url.includes("/gone/") ? 410 : 201);
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      hits.push({ url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(statusFor(req.url));
      res.end();
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, hits, base: `http://127.0.0.1:${server.address().port}` })));
}

function fakeClient() {
  const client = crypto.createECDH("prime256v1");
  client.generateKeys();
  const auth = crypto.randomBytes(16);
  return { client, auth, keys: { p256dh: b64u(client.getPublicKey()), auth: b64u(auth) } };
}

async function login(page) {
  await page.goto(`${L.BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Entrada r[aá]pida/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30000 });
}

async function cleanup() {
  await withDb((c) => c.query("delete from push_subscriptions where endpoint like 'http://127.0.0.1:%'"));
}

(async () => {
  const results = [];
  const fake = await startFakePush();
  try {
    results.push(
      await L.scenario("21a", "Web Push: aes128gcm (RFC 8291) e JWT VAPID ES256", async () => {
        const wp = loadCrypto();
        // Vetor do RFC 8291, apendice A (salt e chave efemera fixos).
        const rfc = wp.encryptPayload(
          Buffer.from("When I grow up, I want to be a watermelon"),
          "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
          "BTBZMqHH6r4Tts7J_aSIgg",
          { salt: unb64u("DGv6ra1nlYgDCS1FRnbzlw"), serverPrivateKey: unb64u("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw") },
        );
        assert.equal(
          b64u(rfc),
          "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
          "corpo diferente do vetor do RFC 8291",
        );
        // Ida e volta com chave de cliente nova e payload com acento/emoji.
        const c = fakeClient();
        const payload = Buffer.from(JSON.stringify({ title: "💰 Venda! R$ 249,90", body: "Blaster · Pix · Curitiba/PR" }));
        const body = wp.encryptPayload(payload, c.keys.p256dh, c.keys.auth);
        assert.equal(decryptPush(body, c.client, c.auth).toString(), payload.toString(), "payload decifrado diferente");
        assert.throws(() => wp.encryptPayload(Buffer.alloc(wp.PUSH_MAX_PAYLOAD + 1), c.keys.p256dh, c.keys.auth), /grande/);
        // JWT VAPID.
        const keys = wp.generateVapidKeys();
        assert.equal(unb64u(keys.publicKey).length, 65);
        const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
        const claims = verifyVapid(wp.vapidAuthorization(endpoint, keys, "mailto:e2e@example.com"), keys.publicKey, endpoint);
        return `RFC 8291 ok; ida e volta ok; JWT aud=${claims.aud}`;
      }),
    );

    results.push(
      await L.scenario("21b", "Rotas do app exigem login (401 JSON)", async () => {
        const got = [];
        for (const [method, p] of [
          ["GET", "/api/admin/sales/recent"],
          ["GET", "/api/admin/push/public-key"],
          ["POST", "/api/admin/push/test"],
          ["POST", "/api/admin/push/subscribe"],
          ["DELETE", "/api/admin/push/subscribe"],
        ]) {
          const r = await fetch(`${L.BASE}${p}`, { method, headers: ORIGIN, body: method === "GET" ? undefined : "{}", redirect: "manual" });
          const data = await r.json().catch(() => null);
          assert.equal(r.status, 401, `${method} ${p} devolveu ${r.status}`);
          assert.ok(data && data.ok === false, `${method} ${p} sem JSON {ok:false}`);
          got.push(`${method} ${p.replace("/api/admin/", "")}`);
        }
        return `401: ${got.join(", ")}`;
      }),
    );

    results.push(
      await L.scenario("21c", "Manifest do app valido (PWABuilder/TWA)", async () => {
        const r = await fetch(`${L.BASE}/admin-app/manifest.webmanifest`);
        assert.equal(r.status, 200);
        assert.match(r.headers.get("content-type") || "", /application\/manifest\+json/);
        const m = await r.json();
        assert.equal(m.name, "AquaBlast Painel");
        assert.equal(m.short_name, "AquaBlast");
        assert.equal(m.start_url, "/admin");
        assert.equal(m.scope, "/admin");
        assert.equal(m.display, "standalone");
        assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
        assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
        const need = [
          ["192x192", "any"],
          ["512x512", "any"],
          ["512x512", "maskable"],
        ];
        for (const [sizes, purpose] of need) {
          const icon = m.icons.find((i) => i.sizes === sizes && (i.purpose || "any").split(" ").includes(purpose));
          assert.ok(icon, `icone ${sizes} ${purpose} ausente`);
          const ir = await fetch(new URL(icon.src, L.BASE));
          assert.equal(ir.status, 200, `${icon.src} devolveu ${ir.status}`);
          const buf = Buffer.from(await ir.arrayBuffer());
          assert.ok(buf.subarray(1, 4).toString() === "PNG", `${icon.src} nao e PNG`);
          const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
          assert.equal(`${w}x${h}`, sizes, `${icon.src} tem ${w}x${h}`);
        }
        const sw = await fetch(`${L.BASE}/admin-sw.js`);
        assert.equal(sw.status, 200);
        assert.match(sw.headers.get("cache-control") || "", /no-cache/);
        assert.match(sw.headers.get("content-type") || "", /javascript/);
        return `${m.name} · start ${m.start_url} · scope ${m.scope} · ${m.icons.length} icones`;
      }),
    );

    const { browser, context, page, pageErrors } = await L.open({ width: 360, height: 740, mobile: true, consent: null });
    try {
      await login(page);

      results.push(
        await L.scenario("21d", "/admin/app em 360px: sem rolagem lateral, manifest e SW em /admin", async () => {
          await page.goto(`${L.BASE}/admin/app`, { waitUntil: "domcontentloaded", timeout: 90000 });
          await page.getByRole("heading", { name: "Avisos neste aparelho" }).waitFor({ state: "visible", timeout: 15000 });
          await page.getByRole("heading", { name: "Últimas vendas pagas" }).waitFor({ state: "visible" });
          await page.getByRole("button", { name: /Ouvir o som de venda/ }).waitFor({ state: "visible" });
          await L.noHorizontalScroll(page);
          const manifest = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute("href"));
          assert.equal(manifest, "/admin-app/manifest.webmanifest");
          const scope = await page.evaluate(async () => {
            for (let i = 0; i < 40; i++) {
              const reg = await navigator.serviceWorker.getRegistration("/admin");
              if (reg && (reg.active || reg.waiting || reg.installing)) return reg.scope;
              await new Promise((r) => setTimeout(r, 250));
            }
            return null;
          });
          assert.equal(scope, `${L.BASE}/admin`, `SW nao registrou no escopo /admin (${scope})`);
          assert.equal(await page.locator(".pwa-toasts[aria-live]").count(), 1, "regiao de avisos (aria-live) ausente");
          const menu = await page.locator('a[href="/admin/app"]').count();
          assert.ok(menu >= 1, "item 'App e avisos' ausente do menu");
          await L.shot(page, "21d-app-360");
          return `SW ${scope}; sem rolagem lateral`;
        }),
      );

      results.push(
        await L.scenario("21e", "Push ponta a ponta: inscricao + Testar aviso chega cifrado no servico local", async () => {
          const pk = await context.request.get(`${L.BASE}/api/admin/push/public-key`);
          assert.equal(pk.status(), 200);
          const { publicKey } = await pk.json();
          assert.equal(unb64u(publicKey).length, 65, "chave VAPID publica invalida");

          const recent = await context.request.get(`${L.BASE}/api/admin/sales/recent`);
          assert.equal(recent.status(), 200);
          const rj = await recent.json();
          assert.ok(Array.isArray(rj.sales) && rj.sales.length <= 20, "sales/recent sem lista (max 20)");
          const bad = await context.request.get(`${L.BASE}/api/admin/sales/recent?since=ontem`);
          assert.equal(bad.status(), 400, "since invalido deveria dar 400");

          const c = fakeClient();
          const endpoint = `${fake.base}/push/ok/${crypto.randomUUID()}`;
          const sub = await context.request.post(`${L.BASE}/api/admin/push/subscribe`, { headers: ORIGIN, data: { endpoint, keys: c.keys } });
          assert.equal(sub.status(), 200, `subscribe devolveu ${sub.status()}: ${await sub.text()}`);
          const row = (await withDb((db) => db.query("select p256dh, auth, admin_user_id from push_subscriptions where endpoint = $1", [endpoint]))).rows[0];
          assert.ok(row && row.admin_user_id, "inscricao nao gravou (ou sem admin)");

          const before = fake.hits.length;
          const t = await context.request.post(`${L.BASE}/api/admin/push/test`, { headers: ORIGIN, data: { endpoint } });
          const tj = await t.json();
          assert.equal(t.status(), 200, `test devolveu ${t.status()}: ${JSON.stringify(tj)}`);
          assert.equal(tj.sent, 1, `sent=${tj.sent}`);
          const hit = fake.hits.slice(before).find((h) => endpoint.endsWith(h.url));
          assert.ok(hit, "servico local nao recebeu o push");
          assert.equal(hit.method, "POST");
          assert.equal(hit.headers["content-encoding"], "aes128gcm");
          assert.equal(hit.headers.ttl, "86400");
          assert.equal(String(hit.headers.urgency).toLowerCase(), "high");
          verifyVapid(hit.headers.authorization, publicKey, endpoint);
          const msg = JSON.parse(decryptPush(hit.body, c.client, c.auth).toString());
          assert.match(msg.title, /Teste/);
          assert.equal(msg.kind, "test");
          assert.ok(String(msg.url).startsWith("/admin"), `url fora do /admin: ${msg.url}`);
          const ok = (await withDb((db) => db.query("select last_ok_at, fail_count from push_subscriptions where endpoint = $1", [endpoint]))).rows[0];
          assert.ok(ok && ok.last_ok_at && ok.fail_count === 0, "last_ok_at/fail_count nao atualizou");

          const del = await context.request.delete(`${L.BASE}/api/admin/push/subscribe`, { headers: ORIGIN, data: { endpoint } });
          assert.equal(del.status(), 200);
          assert.equal((await del.json()).removed, 1);
          return `201 no servico local; titulo "${msg.title}"; VAPID ok; DELETE removeu`;
        }),
      );

      results.push(
        await L.scenario("21f", "Endpoint 410 apaga a inscricao", async () => {
          const c = fakeClient();
          const endpoint = `${fake.base}/push/gone/${crypto.randomUUID()}`;
          const sub = await context.request.post(`${L.BASE}/api/admin/push/subscribe`, { headers: ORIGIN, data: { endpoint, keys: c.keys } });
          assert.equal(sub.status(), 200);
          const t = await context.request.post(`${L.BASE}/api/admin/push/test`, { headers: ORIGIN, data: { endpoint } });
          const tj = await t.json();
          assert.equal(tj.sent, 0);
          assert.equal(tj.removed, 1, `removed=${tj.removed}`);
          const left = (await withDb((db) => db.query("select count(*)::int as n from push_subscriptions where endpoint = $1", [endpoint]))).rows[0].n;
          assert.equal(left, 0, "inscricao 410 continua no banco");
          return "410 -> removida";
        }),
      );

      assert.deepEqual(pageErrors, [], `erros na pagina: ${pageErrors.join(" | ")}`);
    } finally {
      await browser.close();
    }
  } finally {
    await cleanup();
    fake.server.close();
  }
  const bad = results.filter((r) => !r).length;
  process.stdout.write(bad ? `\n${bad} cenario(s) falharam\n` : "\nTodos os cenarios passaram\n");
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  process.stderr.write(`erro: ${String(e && e.message ? e.message : e).slice(0, 400)}\n`);
  process.exit(1);
});
