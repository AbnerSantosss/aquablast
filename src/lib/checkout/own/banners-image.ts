/**
 * Conferência da arte de banner enviada pelo painel, sem biblioteca. Mesma postura das fotos de comentário
 * (reviews-image.ts): o tipo vem dos primeiros bytes do arquivo, nunca do nome nem do `type` que o
 * navegador manda, e a largura/altura vêm do cabeçalho do próprio formato. SVG nunca passa: não tem
 * nenhuma das três assinaturas.
 *
 * A leitura dos cabeçalhos está repetida aqui de propósito: em reviews-image.ts ela é privada, as mensagens
 * de lá falam de "foto" e aquele arquivo não deve mudar por causa do banner.
 *
 * Limite de 2 MB, o mesmo das fotos de comentário (uma regra só no painel). Nos tamanhos recomendados de
 * BANNER_RECOMMENDED (2400 x 120 no computador e 1170 x 195 no celular e tablet) cabe até um PNG de 8 bits
 * sem compressão nenhuma (o maior: 2400 x 120 x 4 bytes = 1,10 MB; o outro: 1170 x 195 x 4 = 0,87 MB), então
 * arte no tamanho recomendado não é recusada pelo peso. Se BANNER_RECOMMENDED mudar, refaça esta conta
 * (largura x altura x 4 precisa ficar abaixo do limite). Acima disso o arquivo é maior do que o checkout
 * mostra e pesa logo no topo da página.
 * A arte é guardada como chegou, sem recompressão.
 */
export const BANNER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
/** O limite como o dono lê no painel e nas recusas: "2 MB". Sai da constante acima. */
export const BANNER_IMAGE_MAX_LABEL = `${String(BANNER_IMAGE_MAX_BYTES / (1024 * 1024)).replace(".", ",")} MB`;
/** Lado máximo aceito, em pixels. */
export const BANNER_IMAGE_MAX_SIDE = 4096;

export type BannerImageMime = "image/jpeg" | "image/png" | "image/webp";
export const BANNER_IMAGE_MIMES: readonly BannerImageMime[] = ["image/jpeg", "image/png", "image/webp"];

export interface BannerImageInfo {
  mime: BannerImageMime;
  width: number;
  height: number;
}

export type BannerImageCheck = { ok: true; info: BannerImageInfo } | { ok: false; message: string };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

function sniff(bytes: Uint8Array): BannerImageMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return "image/webp";
  return null;
}

type Size = { width: number; height: number };

function pngSize(view: DataView): Size | null {
  // Assinatura (8) + tamanho do bloco (4) + "IHDR" (4) + largura (4) + altura (4).
  if (view.byteLength < 24 || view.getUint32(12) !== 0x49484452) return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(view: DataView): Size | null {
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    // Bytes de preenchimento (FF FF) e marcadores sem corpo (RSTn, SOI, TEM).
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC): é onde ficam altura e largura.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (offset + 9 > view.byteLength) return null;
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(bytes: Uint8Array, view: DataView): Size | null {
  if (view.byteLength < 30) return null;
  if (ascii(bytes, 12, "VP8X")) {
    const width = 1 + (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16));
    const height = 1 + (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16));
    return { width, height };
  }
  if (ascii(bytes, 12, "VP8L")) {
    if (view.getUint8(20) !== 0x2f) return null;
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (ascii(bytes, 12, "VP8 ")) {
    // Quadro-chave: 3 bytes de cabeçalho, código de início 9D 01 2A, largura e altura de 14 bits.
    if (view.getUint8(23) !== 0x9d || view.getUint8(24) !== 0x01 || view.getUint8(25) !== 0x2a) return null;
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  return null;
}

/**
 * Peso recebido, em MB com duas casas. Nunca sai igual ao limite: um arquivo poucos bytes acima apareceria
 * como "2,00 MB; o limite é 2 MB", e a recusa pareceria erro do painel.
 */
function receivedLabel(bytes: number): string {
  const megabyte = 1024 * 1024;
  const value = Math.max(Math.round((bytes / megabyte) * 100) / 100, BANNER_IMAGE_MAX_BYTES / megabyte + 0.01);
  return `${value.toFixed(2).replace(".", ",")} MB`;
}

/** Recusa por peso: diz o tamanho recebido, o limite e o que fazer. Usada também antes de ler o corpo inteiro. */
export function bannerTooBigMessage(receivedBytes: number): string {
  return `O arquivo tem ${receivedLabel(receivedBytes)}; o limite é ${BANNER_IMAGE_MAX_LABEL}. Exporte a arte em JPG ou WebP, ou em um tamanho menor, e envie de novo.`;
}

/** Confere tipo (pelos bytes), peso e dimensões. A mensagem de erro diz a causa e o que fazer. */
export function checkBannerImage(bytes: Uint8Array): BannerImageCheck {
  if (bytes.length === 0) return { ok: false, message: "O arquivo chegou vazio. Escolha a arte de novo." };
  const mime = sniff(bytes);
  if (!mime) {
    return { ok: false, message: "Esse arquivo não é uma imagem JPEG, PNG ou WebP (o que vale é o conteúdo do arquivo, não o nome). Exporte a arte em um desses formatos e envie de novo." };
  }
  if (bytes.length > BANNER_IMAGE_MAX_BYTES) return { ok: false, message: bannerTooBigMessage(bytes.length) };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size: Size | null = null;
  try {
    size = mime === "image/png" ? pngSize(view) : mime === "image/jpeg" ? jpegSize(view) : webpSize(bytes, view);
  } catch {
    size = null;
  }
  if (!size || size.width < 1 || size.height < 1) {
    return { ok: false, message: "Não deu para ler essa imagem: o arquivo parece corrompido. Exporte a arte de novo e reenvie." };
  }
  if (size.width > BANNER_IMAGE_MAX_SIDE || size.height > BANNER_IMAGE_MAX_SIDE) {
    return { ok: false, message: `A arte tem ${size.width} x ${size.height} px; o limite é ${BANNER_IMAGE_MAX_SIDE} px no lado maior. Reduza a arte e envie de novo.` };
  }
  return { ok: true, info: { mime, width: size.width, height: size.height } };
}
