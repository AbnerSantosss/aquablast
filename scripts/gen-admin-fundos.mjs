// TEMPORARIO / SOMENTE DESENVOLVIMENTO.
// Gera as imagens de fundo do painel admin (muapi ou OpenRouter) e grava em public/admin-bg/.
// Nao e rota HTTP, fica fora de src/, nao entra no build nem em producao.
//
// Uso (na raiz de aquablast-next):
//   node scripts/gen-admin-fundos.mjs
//   node scripts/gen-admin-fundos.mjs --only login-fundo
//   node scripts/gen-admin-fundos.mjs --model google/gemini-3.1-flash-image
//   node scripts/gen-admin-fundos.mjs --prompts checkout-selos-prompts.json   (selos do checkout)
//   node scripts/gen-admin-fundos.mjs --prompts checkout-selos-prompts.json --so-recortar
//     (reaplica o recorte nos arquivos ja gerados, sem chamar a API e sem gastar credito)
//
// Fundo transparente (2026-09-28): o Gemini e o openai/gpt-5.4-image-2 so entregam fundo solido (o 5.4 responde
// "Accepted: auto, opaque"). O openai/gpt-5-image aceita image_config.background = "transparent" e devolve PNG com
// alfa. Jobs com "transparent": true pedem isso e o sharp NAO achata em branco; "model" no job troca o modelo so dele.
// "mask": "circle" ainda recorta em circulo (dest-in) para garantir borda limpa.
//
// Dois provedores (2026-09-29): --provedor muapi (padrao, mais barato) ou --provedor openrouter.
// Na muapi o --model e o id do endpoint (nano-banana-pro, nano-banana-2) e "muapiModel" no job troca so o dele.
// Fundo transparente so existe na OpenRouter: job com "transparent": true exige --provedor openrouter.
//   node scripts/gen-admin-fundos.mjs --provedor openrouter --prompts checkout-selos-prompts.json
//   node scripts/gen-admin-fundos.mjs --model nano-banana-2 --resolucao 2k
//
// Chave: MUAPI_API_KEY ou OPENROUTER_API_KEY no ambiente ou em .env.local (ignorado pelo git).
// O script NUNCA imprime a chave e nao contem segredo nenhum.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const PROVIDERS = {
  muapi: { envVar: "MUAPI_API_KEY", defaultModel: "nano-banana-pro" },
  openrouter: { envVar: "OPENROUTER_API_KEY", defaultModel: "google/gemini-3-pro-image" },
};
const MUAPI = "https://api.muapi.ai/api/v1";

if (process.env.NODE_ENV === "production") {
  throw new Error("gen-admin-fundos e so de desenvolvimento; nao rode em producao.");
}

function loadKey(envVar) {
  if (process.env[envVar]) return process.env[envVar].trim();
  const envPath = resolve(root, ".env.local");
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, "utf8").match(new RegExp(`^${envVar}=(.+)$`, "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(`${envVar} nao encontrada (ambiente ou .env.local)`);
}

const args = process.argv.slice(2);
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const provider = argValue("--provedor") ?? "muapi";
if (!PROVIDERS[provider]) throw new Error(`--provedor invalido: ${provider} (use muapi ou openrouter)`);
const model = argValue("--model") ?? PROVIDERS[provider].defaultModel;
const resolution = argValue("--resolucao") ?? "1k";
const only = argValue("--only")?.split(",") ?? null;
const promptsFile = resolve(here, argValue("--prompts") ?? "admin-fundos-prompts.json");

const onlyCrop = args.includes("--so-recortar");
const key = onlyCrop ? null : loadKey(PROVIDERS[provider].envVar);
// Garante que nenhuma mensagem de erro carregue a chave.
const redact = (text) => (key ? String(text).split(key).join("[chave]") : String(text)).slice(0, 400);

const jobs = JSON.parse(readFileSync(promptsFile, "utf8"));

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

const jobModel = (job) => (provider === "muapi" ? job.muapiModel ?? model : job.model ?? model);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// muapi: envia o job, consulta o resultado a cada 3 s (ate 5 min) e baixa a primeira imagem.
async function requestImageMuapi(job) {
  if (job.transparent) {
    throw new Error("fundo transparente so na OpenRouter: rode este job com --provedor openrouter");
  }
  const headers = { "x-api-key": key, "Content-Type": "application/json" };
  const body = { prompt: job.prompt, resolution: job.resolution ?? resolution };
  if (job.aspectRatio) body.aspect_ratio = job.aspectRatio;
  const submit = await fetch(`${MUAPI}/${jobModel(job)}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!submit.ok) throw new Error(`HTTP ${submit.status} ${redact(await submit.text())}`);
  const { request_id: requestId } = await submit.json();
  if (!requestId) throw new Error("muapi nao devolveu request_id");

  for (let tries = 0; tries < 100; tries += 1) {
    await sleep(3000);
    const res = await fetch(`${MUAPI}/predictions/${requestId}/result`, { headers: { "x-api-key": key } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${redact(await res.text())}`);
    const json = await res.json();
    if (json.status === "failed" || json.status === "cancelled") throw new Error(`muapi ${json.status}: ${redact(json.error ?? "")}`);
    if (json.status !== "completed") continue;
    const url = json.outputs?.[0];
    if (!url) throw new Error("muapi concluiu sem imagem");
    const img = await fetch(url);
    if (!img.ok) throw new Error(`download da imagem: HTTP ${img.status}`);
    // S3 as vezes responde octet-stream: nesse caso o tipo sai da extensao do link.
    const type = img.headers.get("content-type") ?? "";
    const ext = new URL(url).pathname.split(".").pop().toLowerCase();
    const mime = type.startsWith("image/") ? type : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext || "png"}`;
    return { mime, buffer: Buffer.from(await img.arrayBuffer()) };
  }
  throw new Error("muapi nao terminou em 5 min");
}

async function requestImage(job) {
  if (provider === "muapi") return requestImageMuapi(job);
  const body = {
    model: job.model ?? model,
    modalities: ["image", "text"],
    messages: [{ role: "user", content: [{ type: "text", text: job.prompt }] }],
  };
  if (job.transparent) body.image_config = { background: "transparent", output_format: "png" };
  else if (job.aspectRatio) body.image_config = { aspect_ratio: job.aspectRatio };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "AquaBlast admin (dev)",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${redact(await res.text())}`);
  const json = await res.json();
  const images = json.choices?.[0]?.message?.images ?? [];
  if (!images.length) throw new Error(`resposta sem imagem: ${redact(JSON.stringify(json.error ?? json.choices?.[0]?.message?.content ?? ""))}`);

  const dataUrl = images[0].image_url?.url ?? images[0].url;
  const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/s);
  if (!m) throw new Error("formato de imagem inesperado na resposta");
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

// Mascara circular (dest-in): tudo fora do circulo vira transparente. 1px de folga evita borda branca.
function circleMask(width, height) {
  const r = Math.min(width, height) / 2 - 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${r}" fill="#000"/></svg>`;
  return { input: Buffer.from(svg), blend: "dest-in" };
}

async function save(job, image, sharp) {
  const out = resolve(root, job.out);
  // Pastas permitidas: fundos do painel e selos do checkout (checkout-selos-prompts.json, 2026-09-28).
  const allowed = [resolve(root, "public", "admin-bg"), resolve(root, "public", "checkout", "selos")];
  if (!allowed.some((dir) => out.startsWith(dir))) {
    throw new Error("saida fora de public/admin-bg/ e public/checkout/selos/");
  }
  mkdirSync(dirname(out), { recursive: true });

  if (!sharp) {
    const ext = image.mime === "image/jpeg" ? "jpg" : image.mime.split("/")[1];
    const raw = out.replace(/\.\w+$/, `.${ext}`);
    writeFileSync(raw, image.buffer);
    return { out: raw, note: "sharp ausente: salvo no formato original, sem redimensionar" };
  }

  const maxBytes = (job.maxKB ?? 250) * 1024;
  // Selos: o modelo nem sempre enche o quadro com o circulo; "trim" corta a margem branca para todos
  // ficarem do mesmo tamanho.
  const keepAlpha = Boolean(job.transparent || job.mask);
  if (job.trim) {
    const base = keepAlpha ? sharp(image.buffer) : sharp(image.buffer).flatten({ background: "#ffffff" });
    image = { ...image, buffer: await base.trim({ threshold: 24 }).toBuffer() };
  }
  let result = null;
  for (const quality of [82, 74, 66, 58, 50, 42]) {
    let pipeline = sharp(image.buffer).resize(job.width, job.height, keepAlpha ? { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } } : { fit: "cover", position: "centre" });
    if (!keepAlpha) pipeline = pipeline.flatten({ background: "#ffffff" });
    const { data, info } = await pipeline
      .composite(job.mask === "circle" ? [circleMask(job.width, job.height)] : [])
      .webp({ quality, alphaQuality: 100, effort: 6 })
      .toBuffer({ resolveWithObject: true });
    result = { data, info, quality };
    if (data.length <= maxBytes) break;
  }
  writeFileSync(out, result.data);
  return {
    out,
    note: `${result.info.width}x${result.info.height} q${result.quality} ${(result.data.length / 1024).toFixed(1)} KB`,
  };
}

const sharp = await loadSharp();
// Windows: sem cache o sharp nao segura o arquivo aberto (evita "UNKNOWN: open" ao regravar).
sharp?.cache(false);
const selected = only ? jobs.filter((j) => only.includes(j.id)) : jobs;
if (!selected.length) throw new Error("nenhum job selecionado");

const jobField = provider === "muapi" ? "muapiModel" : "model";
process.stdout.write(`provedor: ${provider} | modelo padrao: ${model} (job com "${jobField}" usa o dele)\n`);
let failed = 0;
for (const job of selected) {
  process.stdout.write(`[${job.id}] ${onlyCrop ? "recortando" : `gerando com ${jobModel(job)}`}... `);
  try {
    const image = onlyCrop ? { mime: "image/webp", buffer: readFileSync(resolve(root, job.out)) } : await requestImage(job);
    const saved = await save(job, image, sharp);
    process.stdout.write(`ok -> ${relative(root, saved.out)} (${saved.note})\n`);
  } catch (e) {
    failed += 1;
    process.stdout.write(`FALHOU: ${redact(e.message)}\n`);
  }
}
process.exitCode = failed ? 1 : 0;
