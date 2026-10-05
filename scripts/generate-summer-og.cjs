// Reutiliza os recortes oficiais, sem alterar o produto nem criar imagem de cliente.
async function main() {
  const [{ default: fs }, { default: path }, { default: React }, { ImageResponse }, { default: sharp }] = await Promise.all([
    import('node:fs/promises'), import('node:path'), import('react'), import('next/og.js'), import('sharp'),
  ]);
  const root = path.resolve(__dirname, '..');
  const pictures = await Promise.all(['azul', 'preto'].map(async color => {
    const png = await sharp(path.join(root, 'public', `produto-${color}.webp`)).resize(410, 410, { fit: 'inside' }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  }));
  const el = React.createElement;
  const art = el('div', { style: { width: '100%', height: '100%', display: 'flex', background: '#f4f5f7', color: '#063760', padding: '56px', fontFamily: 'sans-serif' } },
    el('div', { style: { display: 'flex', flexDirection: 'column', width: '54%', justifyContent: 'center' } },
      el('div', { style: { fontSize: 30, fontWeight: 700, marginBottom: 40 } }, 'AquaBlast'),
      el('div', { style: { fontSize: 21, fontWeight: 700, color: '#00aef0', letterSpacing: 3, marginBottom: 14 } }, 'OFERTA DE VERÃO'),
      el('div', { style: { fontSize: 60, lineHeight: 1.08, fontWeight: 700, marginBottom: 24 } }, 'Seu verão mais divertido.'),
      el('div', { style: { fontSize: 25, lineHeight: 1.4, maxWidth: 480 } }, 'Brinquedo de água elétrico com luz LED e recarga USB.'),
      el('div', { style: { fontSize: 21, fontWeight: 700, marginTop: 26 } }, 'Frete grátis · Rastreio no site')
    ),
    el('div', { style: { display: 'flex', position: 'relative', width: '46%', height: '100%', alignItems: 'center', justifyContent: 'center' } },
      el('div', { style: { display: 'flex', position: 'absolute', width: 390, height: 390, borderRadius: '50%', background: '#ffffff' } }),
      el('img', { src: pictures[0], width: 330, height: 330, alt: '', style: { position: 'absolute', left: -5, top: 32, objectFit: 'contain', transform: 'rotate(-8deg)' } }),
      el('img', { src: pictures[1], width: 320, height: 320, alt: '', style: { position: 'absolute', right: -15, bottom: 15, objectFit: 'contain', transform: 'rotate(9deg)' } })
    )
  );
  const response = new ImageResponse(art, { width: 1200, height: 630 });
  const png = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(path.join(root, 'public', 'og-verao.png'), png);
  console.log(`og-verao.png: 1200x630, ${png.length} bytes`);
}
main().catch(err => { console.error(err); process.exitCode = 1; });
