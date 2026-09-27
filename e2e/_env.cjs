/* eslint-disable @typescript-eslint/no-require-imports */
// Le o .env local sem imprimir valores. Usado so pelos scripts de teste.
const fs = require("fs");
const path = require("path");
function loadEnv() {
  const file = path.join(__dirname, "..", ".env");
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
module.exports = { loadEnv };
