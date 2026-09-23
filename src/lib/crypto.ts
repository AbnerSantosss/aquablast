import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const ALG = "aes-256-gcm";

function key(): Buffer {
  const raw = env().APP_ENCRYPTION_KEY;
  // Aceita base64 (32 bytes) ou qualquer string longa (derivada por SHA-256).
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  return createHash("sha256").update(raw).digest();
}

/** Cifra um texto para gravação em repouso. Formato: base64(iv).base64(tag).base64(ciphertext) */
export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decryptText(payload: string): string {
  const [ivB, tagB, encB] = payload.split(".");
  if (!ivB || !tagB || !encB) throw new Error("Payload cifrado inválido");
  const decipher = createDecipheriv(ALG, key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Alfabeto sem caracteres ambíguos (0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Código de acesso do comprador: 25 caracteres do alfabeto de 31 símbolos ≈ 123 bits,
 * agrupado como AQB-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX para leitura. Só o hash vai ao banco.
 */
export function generateAccessCode(): string {
  const bytes = randomBytes(25);
  let out = "";
  for (let i = 0; i < 25; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return "AQB-" + out.match(/.{1,5}/g)!.join("-");
}

/** Normaliza o que o comprador digitou: maiúsculas, sem espaços; hífens são ignorados no hash. */
export function normalizeAccessCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s]/g, "");
}

export function hashAccessCode(code: string): string {
  return sha256Hex(normalizeAccessCode(code).replace(/-/g, ""));
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
