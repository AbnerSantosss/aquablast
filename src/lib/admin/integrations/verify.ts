import { getEmailProvider } from "@/lib/email/provider";
import { scrub, verifyFastpay, verifyMercadopago, type VerifyResult } from "@/lib/gateways/verify";
import { errorMessage } from "@/lib/log";
import { getSettings, type SettingKey } from "@/lib/settings";
import { verifyMetaConnection } from "@/lib/tracking-ads/meta-capi";
import { clearIntegrationStatus, setIntegrationStatus, type IntegrationKey } from "./status";

/**
 * Verificação REAL das integrações do painel (pedido 2026-09-30, etapa D). SÓ SERVIDOR.
 * Cada teste só lê (nada de cobrança, e-mail ou evento de verdade), tem 10 s de limite e a mensagem
 * nunca contém a chave. O resultado vai para integrations.status (selo do SecretField).
 *
 * Verificáveis: e-mail (provider.verify), Meta (GET do pixel), Mercado Pago (/users/me),
 * FastPay (lista de cobranças, 1 item), 17TRACK (getquota, não gasta cota).
 * Sem teste (selo cinza): IronPay (sem GET inofensivo documentado), GA4 (o Measurement Protocol aceita
 * qualquer segredo com 2xx), segredo do webhook da Zedy e do webhook do Mercado Pago (só conferem assinatura
 * do que chega).
 */

const TIMEOUT_MS = 10_000;

/** Campo do formulário (chave do setting) -> integração cujo selo ele mostra. */
export const FIELD_INTEGRATION: Partial<Record<SettingKey | "email", IntegrationKey>> = {
  email: "email",
  "email.smtp.pass": "email",
  "email.resend.apiKey": "email",
  "email.brevo.apiKey": "email",
  "ads.meta.accessToken": "meta",
  "gateway.mercadopago.accessToken": "gateway.mercadopago",
  "gateway.fastpay.apiKey": "gateway.fastpay",
  "tracking.17track.apiKey": "tracking.17track",
};

/** Tela do painel que mostra o selo de cada integração (para revalidatePath). */
export const INTEGRATION_PAGE: Record<IntegrationKey, string> = {
  email: "/admin/configuracoes",
  meta: "/admin/pixels",
  "gateway.mercadopago": "/admin/gateways",
  "gateway.ironpay": "/admin/gateways",
  "gateway.fastpay": "/admin/gateways",
  "tracking.17track": "/admin/configuracoes",
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error(`sem resposta em ${ms / 1000} s`), { name: "TimeoutError" })), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Testa a conexão do provedor de e-mail ATIVO sem enviar nada (SMTP: handshake + login; Resend/Brevo: GET de leitura). */
export async function verifyEmailConnection(): Promise<VerifyResult> {
  const s = await getSettings(["email.provider", "email.smtp.host", "email.smtp.port", "email.smtp.pass", "email.resend.apiKey", "email.brevo.apiKey"] as const);
  const secrets = [s["email.smtp.pass"], s["email.resend.apiKey"], s["email.brevo.apiKey"]].filter(Boolean);
  const clean = (m: string) => secrets.reduce((t, k) => scrub(t, k), m);
  try {
    const provider = await getEmailProvider();
    await withTimeout(provider.verify(), TIMEOUT_MS);
    if (provider.kind === "smtp") return { ok: true, message: clean(`SMTP ${s["email.smtp.host"]}:${s["email.smtp.port"]}`) };
    return { ok: true, message: provider.kind === "resend" ? "Resend" : "Brevo" };
  } catch (err) {
    return { ok: false, message: clean(errorMessage(err)) };
  }
}

/** 17TRACK: POST /track/v2.4/getquota (doc oficial: consulta a cota, não registra nem gasta nada). */
export async function verify17track(): Promise<VerifyResult> {
  const s = await getSettings(["tracking.17track.apiKey"] as const);
  const key = s["tracking.17track.apiKey"].trim();
  if (!key) return { ok: false, message: "API key não configurada" };
  try {
    const res = await fetch("https://api.17track.net/track/v2.4/getquota", {
      method: "POST",
      headers: { "17token": key, "Content-Type": "application/json" },
      body: "[]",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    let json: { code?: number; data?: { quota_total?: number; quota_remain?: number; errors?: { message?: string }[] } } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      json = {};
    }
    const d = json.data;
    if (res.ok && json.code === 0 && typeof d?.quota_remain === "number") {
      return { ok: true, message: `cota ${d.quota_remain} de ${d.quota_total ?? "?"}` };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, message: `17TRACK recusou a chave (HTTP ${res.status})` };
    const why = d?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    return { ok: false, message: scrub(`17TRACK: ${why}`, key) };
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, message: scrub(timeout ? `sem resposta em ${TIMEOUT_MS / 1000} s` : `falha de rede (${errorMessage(err)})`, key) };
  }
}

const VERIFIERS: Partial<Record<IntegrationKey, () => Promise<VerifyResult>>> = {
  email: verifyEmailConnection,
  meta: verifyMetaConnection,
  "gateway.mercadopago": verifyMercadopago,
  "gateway.fastpay": verifyFastpay,
  "tracking.17track": verify17track,
};

export function isVerifiable(key: IntegrationKey): boolean {
  return Boolean(VERIFIERS[key]);
}

/** Roda a verificação e grava o resultado. Nunca lança. */
export async function runVerification(key: IntegrationKey, actor: string): Promise<VerifyResult> {
  const fn = VERIFIERS[key];
  if (!fn) return { ok: false, message: "esta integração não tem teste disponível" };
  let r: VerifyResult;
  try {
    r = await fn();
  } catch (err) {
    r = { ok: false, message: errorMessage(err).slice(0, 150) };
  }
  await setIntegrationStatus(key, r, actor);
  return r;
}

/**
 * Depois de salvar: segredo novo (ou dado de conexão trocado) invalida o selo antigo e, se der, verifica já.
 * Devolve o texto para completar a mensagem da action ("" quando nada mudou).
 */
export async function refreshIntegration(key: IntegrationKey, actor: string, opts: { changed: boolean; verify: boolean }): Promise<string> {
  if (!opts.changed) return "";
  await clearIntegrationStatus(key, actor);
  if (!opts.verify || !isVerifiable(key)) return "";
  const r = await runVerification(key, actor);
  return r.ok ? ` Conexão verificada: ${r.message}.` : ` A verificação falhou: ${r.message}.`;
}
