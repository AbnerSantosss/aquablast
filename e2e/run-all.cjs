/* eslint-disable @typescript-eslint/no-require-imports */
// Roda todos os testes da fase 14 em sequencia (o dev na 3100 precisa estar no ar).
// Ordem: node e2e/_setup.cjs on  ->  NODE_PATH="$(npm root -g)" node e2e/run-all.cjs  ->  node e2e/_setup.cjs off
// O coletor SMTP (e2e/_smtp-sink.cjs, 127.0.0.1:2525) sobe sozinho aqui se a porta estiver livre e cai no fim;
// sem ele api-5.6/5.7 (carrinho abandonado, cartao recusado) falham por ambiente, nao por codigo.
// Resultado de cada cenario em e2e/out/results.json. A comparacao visual (visual-compare.cjs) fica fora:
// precisa da ORIGEM rodando na porta 3210.
const { spawn, spawnSync } = require("child_process");
const net = require("net");
const path = require("path");

const FILES = ["01-unidade-pix", "02-kit-cartao", "03-editar", "04-cep-manual", "05-celular-360", "06-07-relogio", "08-15-fluxos", "16-cupom", "17-cartao-aguardando", "18-envios-sla", "19-bump-cor-qr", "20-integracoes-meta", "21-app-vendas", "api-14-5"];

const portOpen = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port }, () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let sink = null;
  if (!(await portOpen(2525))) {
    sink = spawn(process.execPath, [path.join(__dirname, "_smtp-sink.cjs")], { stdio: "ignore" });
    for (let i = 0; i < 40 && !(await portOpen(2525)); i++) await sleep(150);
    if (!(await portOpen(2525))) process.stdout.write("[aviso] coletor SMTP 127.0.0.1:2525 nao subiu\n");
  }
  let failed = 0;
  try {
    for (const f of FILES) {
      const r = spawnSync(process.execPath, [path.join(__dirname, `${f}.cjs`)], { stdio: ["ignore", "pipe", "inherit"], env: process.env, encoding: "utf8" });
      process.stdout.write(r.stdout || "");
      failed += ((r.stdout || "").match(/^\[FALHOU\]/gm) || []).length + (r.status ? 1 : 0);
    }
  } finally {
    if (sink) sink.kill();
  }
  process.stdout.write(failed ? `\n${failed} falha(s)\n` : "\ntodos passaram\n");
  process.exitCode = failed ? 1 : 0;
})();
