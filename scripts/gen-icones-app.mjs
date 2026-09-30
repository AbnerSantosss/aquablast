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
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
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

for (const [name, svg] of jobs) {
  const file = path.join(out, name);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
  const meta = await sharp(file).metadata();
  process.stdout.write(`${name}: ${meta.width}x${meta.height}\n`);
}
