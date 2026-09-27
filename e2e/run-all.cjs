/* eslint-disable @typescript-eslint/no-require-imports */
// Roda todos os testes da fase 14 em sequencia (o dev na 3100 e o coletor SMTP precisam estar no ar).
// Ordem: node e2e/_setup.cjs on  ->  NODE_PATH="$(npm root -g)" node e2e/run-all.cjs  ->  node e2e/_setup.cjs off
// Resultado de cada cenario em e2e/out/results.json. A comparacao visual (visual-compare.cjs) fica fora:
// precisa da ORIGEM rodando na porta 3210.
const { spawnSync } = require("child_process");
const path = require("path");

const FILES = ["01-unidade-pix", "02-kit-cartao", "03-editar", "04-cep-manual", "05-celular-360", "06-07-relogio", "08-15-fluxos", "api-14-5"];
let failed = 0;
for (const f of FILES) {
  const r = spawnSync(process.execPath, [path.join(__dirname, `${f}.cjs`)], { stdio: ["ignore", "pipe", "inherit"], env: process.env, encoding: "utf8" });
  process.stdout.write(r.stdout || "");
  failed += ((r.stdout || "").match(/^\[FALHOU\]/gm) || []).length + (r.status ? 1 : 0);
}
process.stdout.write(failed ? `\n${failed} falha(s)\n` : "\ntodos passaram\n");
process.exitCode = failed ? 1 : 0;
