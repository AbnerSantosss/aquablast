import { createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, createCipheriv, sign } from "node:crypto";

/**
 * Web Push sem biblioteca (pedido do dono, 2026-09-30): só node:crypto.
 * - VAPID (RFC 8292): JWT ES256 assinado com a chave privada P-256 do servidor.
 * - Conteúdo (RFC 8291 + RFC 8188, "aes128gcm"): ECDH efêmero com a chave p256dh do navegador,
 *   HKDF com o segredo `auth`, AES-128-GCM num único registro.
 * Funções puras: não leem banco nem ambiente (o e2e 21 transpila e testa este arquivo sozinho).
 */

export function b64urlEncode(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64url");
}

export function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"), "base64url");
}

export interface VapidKeys {
  /** Ponto P-256 não comprimido (65 bytes, 0x04||x||y) em base64url: vai para o navegador (applicationServerKey). */
  publicKey: string;
  /** PKCS#8 DER em base64url. Segredo. */
  privateKey: string;
}

export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  if (!jwk.x || !jwk.y) throw new Error("chave VAPID sem coordenadas");
  const raw = Buffer.concat([Buffer.from([0x04]), b64urlDecode(jwk.x), b64urlDecode(jwk.y)]);
  return { publicKey: b64urlEncode(raw), privateKey: b64urlEncode(privateKey.export({ format: "der", type: "pkcs8" })) };
}

/**
 * Cabeçalho Authorization do VAPID: `vapid t=<jwt>, k=<chave pública>`.
 * `aud` = origin do endpoint; `exp` = agora + 12 h (o máximo aceito é 24 h); `sub` = mailto: ou https:.
 */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64urlEncode(Buffer.from(JSON.stringify({ aud, exp: nowSeconds + 12 * 3600, sub: subject })));
  const input = `${header}.${payload}`;
  const key = createPrivateKey({ key: b64urlDecode(keys.privateKey), format: "der", type: "pkcs8" });
  const signature = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${input}.${b64urlEncode(signature)}, k=${keys.publicKey}`;
}

/** Tamanho do registro declarado no cabeçalho. Um registro só: payload + 1 (delimitador) + 16 (tag) <= RS. */
export const PUSH_RECORD_SIZE = 4096;
/** Maior payload que cabe num registro (4096 - 16 de tag GCM - 1 de delimitador). */
export const PUSH_MAX_PAYLOAD = PUSH_RECORD_SIZE - 17;

export interface EncryptOptions {
  /** Só para teste: salt fixo (16 bytes). */
  salt?: Buffer;
  /** Só para teste: chave privada efêmera do servidor (32 bytes). */
  serverPrivateKey?: Buffer;
}

/**
 * Cifra o payload para uma assinatura (RFC 8291). Devolve o corpo pronto para o POST, com o cabeçalho
 * aes128gcm: salt(16) || rs(uint32 BE) || idlen(1)=65 || chave pública efêmera(65) || registro cifrado.
 */
export function encryptPayload(payload: Buffer, p256dh: string, auth: string, opts: EncryptOptions = {}): Buffer {
  if (payload.length > PUSH_MAX_PAYLOAD) throw new Error("payload grande demais para um registro");
  const uaPublic = b64urlDecode(p256dh);
  const authSecret = b64urlDecode(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) throw new Error("p256dh inválida");
  if (authSecret.length < 16) throw new Error("auth inválido");

  const ecdh = createECDH("prime256v1");
  if (opts.serverPrivateKey) ecdh.setPrivateKey(opts.serverPrivateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ?? randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", ecdhSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12));

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // 0x02 = delimitador do último (e único) registro, sem padding.
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([0x02])])), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(PUSH_RECORD_SIZE, 0);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, encrypted]);
}
