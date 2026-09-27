/* eslint-disable @typescript-eslint/no-require-imports */
// Acesso direto ao Postgres de desenvolvimento (so localhost). Usa o pg do projeto.
const path = require("path");
const { loadEnv } = require("./_env.cjs");
const { Client } = require(path.join(__dirname, "..", "node_modules", "pg"));
async function withDb(fn) {
  const env = loadEnv();
  const url = process.env.DATABASE_URL || env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente");
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("recusado: banco nao e local");
  const c = new Client({ connectionString: url });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}
module.exports = { withDb };
