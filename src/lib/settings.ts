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
}

export type SettingKey = keyof SettingsMap;

const SECRET_KEYS: ReadonlySet<SettingKey> = new Set<SettingKey>([
  "email.smtp.pass",
  "email.resend.apiKey",
  "email.brevo.apiKey",
  "tracking.17track.apiKey",
  "checkout.webhookSecret",
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
