/**
 * Ícones do app do painel (PWA /admin), pedido do dono em 2026-09-30.
 * Usa só a marca que já existe (a gota de public/icon.svg, #00aef0) sobre o navy do painel
 * (--navy #063760 / --deep #032644 em admin.css). Sem arte nova de produto.
 *
 * Gera em public/admin-app/:
 *   icon-192.png, icon-512.png   - "any": quadrado arredondado navy com a gota
 *   icon-maskable-512.png        - "maskable": fundo até a borda, gota dentro da zona segura (círculo de 80%)
 *   apple-touch-icon.png (180)   - iPhone: sem transparência (o iOS arredonda sozinho)
 *   badge-96.png                 - Android: silhueta branca em fundo transparente (o sistema usa só o alfa)
 *
 * Rodar: node scripts/gen-icones-app.mjs
 *
 * Icone ilustrado (2026-09-30, pedido do dono "use o ChatGPT imagem para deixar bonito"): se existir
 * scripts/icone-app/mestre.png (1024, quadrado cheio, gerado por `node scripts/gen-admin-fundos.mjs
 * --provedor openrouter --prompts icone-app-prompts.json`, modelo openai/gpt-5.4-image-2), os icones do app
 * saem dele; o desenho em SVG abaixo vira so a reserva. O badge continua em SVG (o Android usa so o alfa).
 * Trocar o icone muda o APK: gerar outro no PWABuilder (ver wiki aquablast-app-vendas-pwa).
 */
import sharp from "sharp";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "admin-app");
mkdirSync(out, { recursive: true });

// Gota da marca (public/icon.svg), viewBox 64: x 12..56, y 3..64.
const DROP = "M34 3C22 18 12 29 12 42a22 22 0 1 0 44 0C56 29 46 18 34 3Z";

/** Gota centralizada: `scale` = altura da gota / lado do ícone. */
function dropGroup(size, scale, fill) {
  const h = 61; // altura da gota no viewBox
  const k = (size * scale) / h;
  const w = 44 * k;
  const x = (size - w) / 2 - 12 * k;
  const y = (size - h * k) / 2 - 3 * k;
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})"><path d="${DROP}" fill="${fill}"/></g>`;
}

function shine(size, scale) {
  // Brilho discreto no lado esquerdo da gota (mesma leitura da marca, só com volume).
  const k = (size * scale) / 61;
  const x = (size - 44 * k) / 2 - 12 * k;
  const y = (size - 61 * k) / 2 - 3 * k;
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})"><path d="M22 40c0-6 3-12 8-19" stroke="#ffffff" stroke-opacity=".55" stroke-width="3.2" stroke-linecap="round" fill="none"/></g>`;
}

const DEFS = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a4a7e"/><stop offset=".55" stop-color="#063760"/><stop offset="1" stop-color="#032644"/></linearGradient>
  <linearGradient id="drop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#63e1ff"/><stop offset="1" stop-color="#00aef0"/></linearGradient>
</defs>`;

function appIcon(size, { rounded, scale }) {
  const r = rounded ? Math.round(size * 0.22) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${DEFS}
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  ${dropGroup(size, scale, "url(#drop)")}
  ${shine(size, scale)}
</svg>`;
}

function badge(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${dropGroup(size, 0.82, "#ffffff")}</svg>`;
}

const jobs = [
  ["icon-192.png", appIcon(192, { rounded: true, scale: 0.62 })],
  ["icon-512.png", appIcon(512, { rounded: true, scale: 0.62 })],
  ["icon-maskable-512.png", appIcon(512, { rounded: false, scale: 0.5 })],
  ["apple-touch-icon.png", appIcon(180, { rounded: false, scale: 0.58 })],
  ["badge-96.png", badge(96)],
];

const master = path.join(root, "scripts", "icone-app", "mestre.png");
sharp.cache(false);

/** Icone a partir do mestre: "rounded" recorta cantos de 22% (icone "any"); sem isso, quadrado cheio. */
async function fromMaster(size, { rounded }) {
  // Icone "any" (cantos arredondados): corta 10% de cada lado para a gota aparecer maior no tamanho pequeno.
  // O maskable precisa da margem inteira (o Android recorta em circulo de 80%).
  const meta = await sharp(master).metadata();
  const m = rounded ? Math.round(meta.width * 0.1) : 0;
  const img = sharp(master).extract({ left: m, top: m, width: meta.width - 2 * m, height: meta.height - 2 * m }).resize(size, size, { fit: "cover" });
  if (!rounded) return img.flatten({ background: "#032644" }).png({ compressionLevel: 9 }).toBuffer();
  const r = Math.round(size * 0.22);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#000"/></svg>`);
  return img.composite([{ input: mask, blend: "dest-in" }]).png({ compressionLevel: 9 }).toBuffer();
}

const fromMasterJobs = {
  "icon-192.png": () => fromMaster(192, { rounded: true }),
  "icon-512.png": () => fromMaster(512, { rounded: true }),
  // O mestre ja deixa o desenho nos 60% centrais: cabe no circulo seguro (80%) do maskable.
  "icon-maskable-512.png": () => fromMaster(512, { rounded: false }),
  "apple-touch-icon.png": () => fromMaster(180, { rounded: false }),
};
const useMaster = existsSync(master);
process.stdout.write(useMaster ? "usando scripts/icone-app/mestre.png\n" : "sem mestre: desenho em SVG\n");

for (const [name, svg] of jobs) {
  const file = path.join(out, name);
  const buffer = useMaster && fromMasterJobs[name] ? await fromMasterJobs[name]() : await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  await sharp(buffer).toFile(file);
  const meta = await sharp(file).metadata();
  process.stdout.write(`${name}: ${meta.width}x${meta.height}\n`);
}
