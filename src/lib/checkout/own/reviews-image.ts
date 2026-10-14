/**
 * Conferência das fotos de comentário do checkout, sem biblioteca: o tipo vem dos primeiros bytes do
 * arquivo (o `type` que o navegador manda é só um palpite e pode ser forjado) e a largura/altura vêm
 * do cabeçalho do próprio formato. SVG nunca passa: não tem nenhuma das três assinaturas.
 */

export const REVIEW_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const REVIEW_IMAGES_PER_REVIEW = 3;
/** Lado máximo aceito no servidor. O painel já reduz para 1200 px; a folga cobre envio direto. */
const MAX_SIDE = 4096;

export type ReviewImageMime = "image/jpeg" | "image/png" | "image/webp";

export interface ReviewImageInfo {
  mime: ReviewImageMime;
  width: number;
  height: number;
}

export type ReviewImageCheck = { ok: true; info: ReviewImageInfo } | { ok: false; message: string };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

function sniff(bytes: Uint8Array): ReviewImageMime | null {
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

/** "3,1 MB" / "640 KB", no formato que o dono lê na mensagem de erro. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Confere tamanho, tipo (pelos bytes) e dimensões. A mensagem de erro diz a causa e o que fazer. */
export function checkReviewImage(bytes: Uint8Array): ReviewImageCheck {
  if (bytes.length === 0) return { ok: false, message: "O arquivo chegou vazio. Escolha a foto de novo." };
  const mime = sniff(bytes);
  if (!mime) return { ok: false, message: "Esse arquivo não é uma foto JPEG, PNG ou WebP. Escolha uma foto nesses formatos." };
  if (bytes.length > REVIEW_IMAGE_MAX_BYTES) {
    return { ok: false, message: `A foto tem ${formatBytes(bytes.length)}; o limite é 2 MB. Escolha uma foto menor ou reduza antes de enviar.` };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size: Size | null = null;
  try {
    size = mime === "image/png" ? pngSize(view) : mime === "image/jpeg" ? jpegSize(view) : webpSize(bytes, view);
  } catch {
    size = null;
  }
  if (!size || size.width < 1 || size.height < 1) {
    return { ok: false, message: "Não deu para ler essa foto: o arquivo parece corrompido. Salve a foto de novo e reenvie." };
  }
  if (size.width > MAX_SIDE || size.height > MAX_SIDE) {
    return { ok: false, message: `A foto tem ${size.width} x ${size.height} px; o limite é ${MAX_SIDE} px no lado maior. Reduza a foto e reenvie.` };
  }
  return { ok: true, info: { mime, width: size.width, height: size.height } };
}
