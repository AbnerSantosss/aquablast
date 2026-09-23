// One-off: converts the two remaining PNG artworks to WebP (full resolution, alpha preserved).
// Usage: node scripts/convert-images.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const files = ["campanha-abertura.png", "video-moldura.png"];

for (const file of files) {
  const input = path.join(publicDir, file);
  const output = input.replace(/\.png$/, ".webp");
  const info = await sharp(input).webp({ quality: 85, alphaQuality: 100, effort: 6 }).toFile(output);
  process.stdout.write(`${file} -> ${path.basename(output)} ${info.width}x${info.height} ${info.size} bytes\n`);
}
