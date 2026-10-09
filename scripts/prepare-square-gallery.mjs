import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Generated with image_gen from the existing photographs; originals are preserved.
const generated = 'C:/Users/binho/.codex/generated_images/01a0e935-2395-7092-8f26-55ce8fc9283c';
const assets = {
  overview: 'exec-cc13cf24-9cec-436f-bd6d-4c3938ddb3f2.png',
  'included-azul': 'exec-715b96c7-30af-4f6e-8f86-9686bb9767fa.png',
  'included-vermelho': 'exec-77144033-ed39-41c3-b719-3be5a4d84645.png',
  'included-preto': 'exec-b721fe4e-887c-441b-8ef7-494ae47c1d35.png',
  detail: 'exec-70c82843-b3d3-46db-8980-90ffcaf8575a.png',
  led: 'exec-42435f93-f8ec-4477-bc51-a0ec0fde990f.png',
};

async function main() {
  const output = path.resolve('public/media/gallery-square');
  const sources = path.resolve('../outputs/ofertas-moldura/square-sources');
  await fs.mkdir(output, { recursive: true });
  await fs.mkdir(sources, { recursive: true });
  const metadataPath = path.resolve('src/lib/site/gallery-images.json');
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  for (const [key, file] of Object.entries(assets)) {
    const source = path.join(generated, file);
    const size = await sharp(source).metadata();
    if (size.width !== size.height) throw new Error(`Expected square asset: ${key}`);
    await fs.copyFile(source, path.join(sources, `${key}.png`));
    for (const width of [240, 480, 640, 960, 1280]) {
      await sharp(source).resize(width).webp({ quality: width === 240 ? 76 : 84 }).toFile(path.join(output, `${key}-square01-${width}.webp`));
    }
    const blur = await sharp(source).resize(20).webp({ quality: 40 }).toBuffer();
    metadata[key] = {
      src: `/media/gallery-square/${key}-square01-960.webp`,
      thumbSrc: `/media/gallery-square/${key}-square01-240.webp`,
      width: 960,
      height: 960,
      blurDataURL: `data:image/webp;base64,${blur.toString('base64')}`,
    };
  }
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
  process.stdout.write('Six square gallery assets prepared with responsive WebP variants.\n');
}
main().catch((error) => { process.stderr.write(String(error)); process.exitCode = 1; });
