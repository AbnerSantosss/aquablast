import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "public/media/gallery-fast");
const widths = [240, 480, 640, 960, 1280];
const quality = 78;
const originals = {
  overview: "premium-v4/overview.webp",
  "kit-azul-preto": "premium-v4/kit-azul-preto.webp",
  "kit-azul-azul": "premium-v2/kit-azul-azul-square.webp",
  "kit-azul-vermelho": "premium-v2/kit-azul-vermelho-square.webp",
  "kit-preto-preto": "premium-v2/kit-preto-preto-square.webp",
  "kit-preto-vermelho": "premium-v2/kit-preto-vermelho-square.webp",
  "kit-vermelho-vermelho": "premium-v2/kit-vermelho-vermelho-square.webp",
  "included-azul": "premium-v3/included-azul.webp",
  "included-preto": "premium-v3/included-preto.webp",
  "included-vermelho": "premium-v3/included-vermelho.webp",
  detail: "premium-v3/detail.webp",
  led: "premium-v2/led.webp",
  family: "premium-v2/family.webp",
};

await mkdir(outputDirectory, { recursive: true });

const reports = [];
const entries = await Promise.all(Object.entries(originals).map(async ([name, original]) => {
  const input = await readFile(path.join(root, "public/media", original));
  const hash = createHash("sha256").update(input).update(`gallery-v1-q${quality}`).digest("hex").slice(0, 10);
  const stem = `${name}-${hash}`;
  const variants = await Promise.all(widths.map(async (width) => {
    const { data, info } = await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toBuffer({ resolveWithObject: true });
    await writeFile(path.join(outputDirectory, `${stem}-${width}.webp`), data);
    return [width, { width: info.width, height: info.height, bytes: data.byteLength }];
  }));
  const sizes = Object.fromEntries(variants);
  const preview = await sharp(input).resize({ width: 8 }).webp({ quality: 35 }).toBuffer();
  const src = `/media/gallery-fast/${stem}-960.webp`;
  reports.push({ name, originalBytes: input.byteLength, variants: sizes });
  return [name, {
    src,
    thumbSrc: `/media/gallery-fast/${stem}-240.webp`,
    width: sizes[960].width,
    height: sizes[960].height,
    blurDataURL: `data:image/webp;base64,${preview.toString("base64")}`,
  }];
}));

await writeFile(path.join(root, "src/lib/site/gallery-images.json"), `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`);
await mkdir(path.join(root, "outputs/gallery-performance"), { recursive: true });
await writeFile(path.join(root, "outputs/gallery-performance/sizes.json"), `${JSON.stringify(reports, null, 2)}\n`);
console.table(reports.map(({ name, originalBytes, variants }) => ({
  image: name,
  originalKB: (originalBytes / 1024).toFixed(1),
  mobile640KB: (variants[640].bytes / 1024).toFixed(1),
  desktop960KB: (variants[960].bytes / 1024).toFixed(1),
  thumbKB: (variants[240].bytes / 1024).toFixed(1),
})));
