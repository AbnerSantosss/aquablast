/* eslint-disable @typescript-eslint/no-require-imports */
// Prepara (on) e desfaz (off) o banco de DESENVOLVIMENTO para os testes da fase 14.
//   node e2e/_setup.cjs on   -> checkout.mode=proprio, gateways simulado, Meta ligada SEM pixel
//                                (gera linhas em conversion_events sem nenhuma chamada de rede),
//                                SMTP apontado para o coletor local 127.0.0.1:2525 (e2e/_smtp-sink.cjs).
//   node e2e/_setup.cjs off  -> devolve as linhas de e-mail/ads exatamente como estavam (backup em e2e/out/).
//                                checkout.mode e gateways ficam como a 14.2 pede (proprio + simulado).
// Nunca le nem grava segredo: email.smtp.pass e demais chaves cifradas nao sao tocadas.
const fs = require("fs");
const path = require("path");
const { withDb } = require("./_db.cjs");

const OUT = path.join(__dirname, "out");
const BACKUP = path.join(OUT, ".settings-backup.json");
const KEEP = { "checkout.mode": "proprio", "gateway.pix": "simulado", "gateway.card": "simulado" };
const TEMP = {
  "ads.meta.enabled": true,
  "ads.meta.pixelId": "",
  "ads.ga4.enabled": false,
  "email.provider": "smtp",
  "email.smtp.host": "127.0.0.1",
  "email.smtp.port": 2525,
  "email.smtp.secure": false,
  "email.smtp.user": "",
};

async function upsert(c, key, value) {
  await c.query(
    "insert into settings(key, value, encrypted, updated_at, updated_by) values ($1, $2::jsonb, false, now(), 'e2e') on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = 'e2e'",
    [key, JSON.stringify(value)],
  );
}

async function on() {
  fs.mkdirSync(OUT, { recursive: true });
  await withDb(async (c) => {
    if (!fs.existsSync(BACKUP)) {
      const keys = Object.keys(TEMP);
      const r = await c.query("select key, value, encrypted, updated_by from settings where key = any($1)", [keys]);
      const rows = {};
      for (const k of keys) rows[k] = null;
      for (const row of r.rows) {
        if (row.encrypted) throw new Error(`chave cifrada inesperada: ${row.key}`);
        rows[row.key] = { value: row.value, updated_by: row.updated_by };
      }
      fs.writeFileSync(BACKUP, JSON.stringify(rows, null, 2));
    }
    for (const [k, v] of Object.entries(KEEP)) await upsert(c, k, v);
    for (const [k, v] of Object.entries(TEMP)) await upsert(c, k, v);
    await c.query("delete from rate_limits where key like 'ck:%'");
  });
  process.stdout.write("setup on: proprio + simulado + meta sem pixel + smtp local\n");
}

async function off() {
  if (!fs.existsSync(BACKUP)) {
    process.stdout.write("setup off: sem backup, nada a restaurar\n");
    return;
  }
  const rows = JSON.parse(fs.readFileSync(BACKUP, "utf8"));
  await withDb(async (c) => {
    for (const [k, row] of Object.entries(rows)) {
      if (row === null) await c.query("delete from settings where key = $1", [k]);
      else
        await c.query("update settings set value = $2::jsonb, updated_at = now(), updated_by = $3 where key = $1", [k, JSON.stringify(row.value), row.updated_by]);
    }
  });
  fs.unlinkSync(BACKUP);
  process.stdout.write("setup off: e-mail e ads restaurados\n");
}

const cmd = process.argv[2];
(cmd === "on" ? on() : cmd === "off" ? off() : Promise.reject(new Error("uso: on | off"))).catch((e) => {
  process.stderr.write(`erro: ${e.message}\n`);
  process.exit(1);
});
