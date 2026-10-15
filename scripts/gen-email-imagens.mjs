// Gera as fotos usadas nos e-mails (lib/email/recovery-blocks.ts) em public/email/.
// Por que JPG: o Outlook desktop não abre WebP e o Gmail/Apple Mail abrem JPG em qualquer conexão. As fotos do
// site são WebP (com transparência), então aqui elas são achatadas sobre fundo branco e reduzidas para 480 px de
// largura (exibidas a 240 px no e-mail; o dobro de pixels deixa nítido em tela retina).
// Uso: node scripts/gen-email-imagens.mjs   (não altera nem apaga as imagens originais de public/)
import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const outDir = path.join(publicDir, "email");
const WIDTH = 480;
const QUALITY = 82;

// Foto do kit: a de duas unidades é quadrada, igual às fotos de produto, e o cartão do e-mail é quadrado.
const jobs = [
  ["produto-azul.webp", "produto-azul.jpg"],
  ["produto-preto.webp", "produto-preto.jpg"],
  ["produto-vermelho.webp", "produto-vermelho.jpg"],
  [process.env.KIT_SOURCE ?? "kit-duas-unidades.jpg", "kit.jpg"],
];

await mkdir(outDir, { recursive: true });
for (const [from, to] of jobs) {
  const target = path.join(outDir, to);
  await sharp(path.join(publicDir, from))
    .resize({ width: WIDTH })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toFile(target);
  const info = await sharp(target).metadata();
  const { size } = await stat(target);
  process.stdout.write(`${from} -> email/${to} ${info.width}x${info.height} ${Math.round(size / 1024)} KB\n`);
}
