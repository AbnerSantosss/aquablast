import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { decryptText, encryptText } from "./crypto";
import { env } from "./env";

/**
 * Configurações editáveis no painel. Cada chave tem um tipo e um flag de sigilo.
 * Valores sigilosos são cifrados em repouso e nunca voltam inteiros para a UI
 * (o painel mostra só "configurado" + últimos 4 caracteres).
 */
export type EmailProviderKind = "smtp" | "resend" | "brevo";
export type TrackingProviderKind = "17track" | "manual";

export interface SettingsMap {
  "email.provider": EmailProviderKind;
  "email.from.name": string;
  "email.from.address": string;
  "email.replyTo": string;
  "email.smtp.host": string;
  "email.smtp.port": number;
  "email.smtp.secure": boolean;
  "email.smtp.user": string;
  "email.smtp.pass": string; // secret
  "email.resend.apiKey": string; // secret
  "email.brevo.apiKey": string; // secret
  /** Minutos após o Pix pendente para o lembrete automático (0 = desligado). */
  "email.pixReminder.afterMinutes": number;
  "email.pixReminder.maxCount": number;

  "tracking.provider": TrackingProviderKind;
  "tracking.17track.apiKey": string; // secret
  /** Código de transportadora padrão quando o admin não escolhe (101332 = SPX/Shopee Express BR). */
  "tracking.17track.defaultCarrier": number;
  "tracking.syncIntervalMinutes": number;

  "checkout.provider": string;
  /** Mapeamento opcional de campos do payload (dot paths). Ver lib/checkout/normalize.ts */
  "checkout.fieldMap": Record<string, string>;
  /** Segredo/assinatura do webhook do checkout, quando a plataforma oferecer. */
  "checkout.webhookSecret": string; // secret
  "checkout.signatureHeader": string;

  "store.name": string;
  "store.supportWhatsapp": string;
  "store.supportEmail": string;
  "store.trackingPageUrl": string;
  "accessCode.validityDays": number;

  /** proprio = checkout interno; zedy = manda para a Zedy (plano B). */
  "checkout.mode": "proprio" | "zedy";
  "checkout.prices": { unit: { pix: number; card: number }; kit: { pix: number; card: number } }; // centavos
  "checkout.maxInstallments": number;
  "checkout.bumpEnabled": boolean;
  "checkout.pixTtlSeconds": number;
  /**
   * Cupom de teste (painel > Gateways): com `enabled` e o código certo, o Pix sai por `pixCents`.
   * Existe para o dono pagar um Pix real de valor mínimo e provar o gateway ponta a ponta. Desligar depois.
   */
  "checkout.testCoupon": { enabled: boolean; code: string; pixCents: number };
  "checkout.theme": Record<string, unknown>;
  "checkout.recovery.enabled": boolean;
  /** Minutos sem atividade para o carrinho virar "abandonado" e receber o 1º e-mail. */
  "checkout.recovery.firstAfterMinutes": number;
  "checkout.recovery.secondAfterMinutes": number;
  "checkout.recovery.thirdAfterMinutes": number;

  "gateway.pix": "ironpay" | "mercadopago" | "fastpay" | "simulado";
  "gateway.card": "ironpay" | "mercadopago" | "fastpay" | "simulado" | "desligado";
  "gateway.ironpay.apiToken": string; // secret
  "gateway.ironpay.offerHashUnit": string;
  "gateway.ironpay.offerHashKit": string;
  "gateway.ironpay.productHashUnit": string;
  "gateway.ironpay.productHashKit": string;
  "gateway.mercadopago.accessToken": string; // secret
  "gateway.mercadopago.publicKey": string;
  "gateway.mercadopago.webhookSecret": string; // secret
  /** Chave de API da FastPay (Basic Auth `API_KEY:`). A mesma URL serve teste e produção: só muda a chave. */
  "gateway.fastpay.apiKey": string; // secret
  /** Token que entra na URL do postback. Gerado no painel. */
  "gateway.postbackToken": string; // secret

  "ads.meta.enabled": boolean;
  "ads.meta.pixelId": string;
  "ads.meta.accessToken": string; // secret
  "ads.meta.testEventCode": string;
  "ads.ga4.enabled": boolean;
  "ads.ga4.measurementId": string;
  "ads.ga4.apiSecret": string; // secret
  "ads.consentRequired": boolean;
}

export type SettingKey = keyof SettingsMap;

const SECRET_KEYS: ReadonlySet<SettingKey> = new Set<SettingKey>([
  "email.smtp.pass",
  "email.resend.apiKey",
  "email.brevo.apiKey",
  "tracking.17track.apiKey",
  "checkout.webhookSecret",
  "gateway.ironpay.apiToken",
  "gateway.mercadopago.accessToken",
  "gateway.mercadopago.webhookSecret",
  "gateway.fastpay.apiKey",
  "gateway.postbackToken",
  "ads.meta.accessToken",
  "ads.ga4.apiSecret",
]);

export function isSecretKey(key: SettingKey): boolean {
  return SECRET_KEYS.has(key);
}

export const DEFAULTS: SettingsMap = {
  "email.provider": "smtp",
  "email.from.name": "AquaBlast",
  "email.from.address": "",
  "email.replyTo": "",
  "email.smtp.host": "smtp.gmail.com",
  "email.smtp.port": 465,
  "email.smtp.secure": true,
  "email.smtp.user": "",
  "email.smtp.pass": "",
  "email.resend.apiKey": "",
  "email.brevo.apiKey": "",
  "email.pixReminder.afterMinutes": 60,
  "email.pixReminder.maxCount": 2,
  "tracking.provider": "17track",
  "tracking.17track.apiKey": "",
  "tracking.17track.defaultCarrier": 101332,
  "tracking.syncIntervalMinutes": 60,
  "checkout.provider": "generic",
  "checkout.fieldMap": {},
  "checkout.webhookSecret": "",
  "checkout.signatureHeader": "",
  "store.name": "AquaBlast",
  "store.supportWhatsapp": "5581996584578",
  "store.supportEmail": "contato@aquablast.com.br",
  "store.trackingPageUrl": "/rastrear",
  "accessCode.validityDays": 180,

  "checkout.mode": "zedy",
  "checkout.prices": { unit: { pix: 15990, card: 16990 }, kit: { pix: 24990, card: 25990 } },
  "checkout.maxInstallments": 12,
  "checkout.bumpEnabled": true,
  "checkout.pixTtlSeconds": 600,
  "checkout.testCoupon": { enabled: false, code: "", pixCents: 500 },
  "checkout.theme": {},
  "checkout.recovery.enabled": true,
  "checkout.recovery.firstAfterMinutes": 30,
  "checkout.recovery.secondAfterMinutes": 1440,
  "checkout.recovery.thirdAfterMinutes": 4320,
  "gateway.pix": "simulado",
  "gateway.card": "simulado",
  "gateway.ironpay.apiToken": "",
  "gateway.ironpay.offerHashUnit": "",
  "gateway.ironpay.offerHashKit": "",
  "gateway.ironpay.productHashUnit": "",
  "gateway.ironpay.productHashKit": "",
  "gateway.mercadopago.accessToken": "",
  "gateway.mercadopago.publicKey": "",
  "gateway.mercadopago.webhookSecret": "",
  "gateway.fastpay.apiKey": "",
  "gateway.postbackToken": "",
  "ads.meta.enabled": false,
  "ads.meta.pixelId": "",
  "ads.meta.accessToken": "",
  "ads.meta.testEventCode": "",
  "ads.ga4.enabled": false,
  "ads.ga4.measurementId": "",
  "ads.ga4.apiSecret": "",
  "ads.consentRequired": true,
};

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsMap[K]> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  if (!row || row.value === null || row.value === undefined) return DEFAULTS[key];
  if (row.encrypted) {
    try {
      return decryptText(row.value as string) as SettingsMap[K];
    } catch {
      return DEFAULTS[key];
    }
  }
  // O Drizzle aplica JSON.parse de novo no jsonb: texto só de dígitos (ex.: o WhatsApp
  // "5581999999999") volta como número, e escapeHtml() dos e-mails quebraria com número.
  if (typeof DEFAULTS[key] === "string" && typeof row.value === "number") return String(row.value) as SettingsMap[K];
  return row.value as SettingsMap[K];
}

export async function getSettings<K extends SettingKey>(keys: readonly K[]): Promise<Pick<SettingsMap, K>> {
  const out: Partial<SettingsMap> = {};
  for (const k of keys) out[k] = await getSetting(k);
  return out as Pick<SettingsMap, K>;
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingsMap[K], updatedBy = "system"): Promise<void> {
  const secret = isSecretKey(key);
  const stored = secret ? encryptText(String(value)) : value;
  await db
    .insert(settings)
    .values({ key, value: stored as unknown as object, encrypted: secret, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: stored as unknown as object, encrypted: secret, updatedAt: new Date(), updatedBy },
    });
}

/** Para a UI: nunca devolve o segredo, só se está configurado e um sufixo. */
export async function describeSecret(key: SettingKey): Promise<{ configured: boolean; hint: string }> {
  const v = String((await getSetting(key)) ?? "");
  if (!v) return { configured: false, hint: "" };
  return { configured: true, hint: v.length > 4 ? "••••" + v.slice(-4) : "••••" };
}

/**
 * Semeia valores iniciais a partir do .env só quando a chave ainda não existe no banco.
 * Assim o painel continua mandando depois da primeira subida.
 */
export async function seedSettingsFromEnv(): Promise<void> {
  const e = env();
  const seed: Partial<SettingsMap> = {};
  if (e.SMTP_HOST) seed["email.smtp.host"] = e.SMTP_HOST;
  if (e.SMTP_PORT) seed["email.smtp.port"] = e.SMTP_PORT;
  if (e.SMTP_SECURE !== undefined) seed["email.smtp.secure"] = e.SMTP_SECURE;
  if (e.SMTP_USER) seed["email.smtp.user"] = e.SMTP_USER;
  if (e.SMTP_PASS) seed["email.smtp.pass"] = e.SMTP_PASS;
  if (e.EMAIL_FROM_NAME) seed["email.from.name"] = e.EMAIL_FROM_NAME;
  if (e.EMAIL_FROM_ADDRESS) seed["email.from.address"] = e.EMAIL_FROM_ADDRESS;
  else if (e.SMTP_USER?.includes("@")) seed["email.from.address"] = e.SMTP_USER;
  if (e.TRACKING_17TRACK_API_KEY) seed["tracking.17track.apiKey"] = e.TRACKING_17TRACK_API_KEY;

  for (const [k, v] of Object.entries(seed) as [SettingKey, SettingsMap[SettingKey]][]) {
    const exists = await db.query.settings.findFirst({ where: eq(settings.key, k) });
    if (!exists) await setSetting(k, v as never, "env-seed");
  }
}
