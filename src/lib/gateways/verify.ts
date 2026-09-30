import { errorMessage } from "@/lib/log";
import { getSettings } from "@/lib/settings";

/**
 * "Verificar" das credenciais de gateway no painel (pedido 2026-09-30, etapa D). SÓ SERVIDOR.
 * Regra: só GET que apenas LÊ, documentado pelo gateway. NUNCA cria cobrança, oferta ou produto para testar.
 * - Mercado Pago: GET /users/me (dados da conta dona do token).
 * - FastPay: GET /v1/charges?page=1&size=1 (lista de cobranças, doc "get-all-charges"; já usado no fetchStatus).
 * - IronPay: sem verificação. A doc pública só tem POST /transactions, GET /transactions/{hash} (precisa de um
 *   hash existente) e estorno; nenhum GET inofensivo sem hash. Selo cinza "sem teste disponível".
 * Timeout de 10 s. A mensagem nunca contém a chave (vai ao HTML do painel).
 */

const TIMEOUT_MS = 10_000;

export type VerifyResult = { ok: boolean; message: string };

async function getJson(url: string, headers: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await res.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function networkFailure(err: unknown, secret: string): VerifyResult {
  const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
  const msg = timeout ? `sem resposta em ${TIMEOUT_MS / 1000} s` : `falha de rede (${errorMessage(err)})`;
  return { ok: false, message: scrub(msg, secret) };
}

/** Tira a chave de qualquer texto que vá para o painel. */
export function scrub(text: string, secret: string): string {
  const t = secret ? text.split(secret).join("***") : text;
  return t.slice(0, 150);
}

const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export async function verifyMercadopago(): Promise<VerifyResult> {
  const s = await getSettings(["gateway.mercadopago.accessToken"] as const);
  const token = s["gateway.mercadopago.accessToken"].trim();
  if (!token) return { ok: false, message: "Access Token não configurado" };
  try {
    const r = await getJson("https://api.mercadopago.com/users/me", { Authorization: `Bearer ${token}` });
    if (r.status === 200 && r.body) {
      const nick = text(r.body.nickname).slice(0, 40);
      const kind = token.startsWith("TEST-") ? "credencial de teste" : "";
      return { ok: true, message: [nick ? `conta ${nick}` : "conta encontrada", kind].filter(Boolean).join(", ") };
    }
    if (r.status === 401 || r.status === 403) return { ok: false, message: `Mercado Pago recusou o token (HTTP ${r.status})` };
    return { ok: false, message: scrub(`Mercado Pago HTTP ${r.status}${r.body?.message ? `: ${text(r.body.message)}` : ""}`, token) };
  } catch (err) {
    return networkFailure(err, token);
  }
}

export async function verifyFastpay(): Promise<VerifyResult> {
  const s = await getSettings(["gateway.fastpay.apiKey"] as const);
  const key = s["gateway.fastpay.apiKey"].trim();
  if (!key) return { ok: false, message: "chave não configurada" };
  try {
    const r = await getJson("https://api-global.fastpaybrasil.com/v1/charges?page=1&size=1", {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
    });
    if (r.status >= 200 && r.status < 300) return { ok: true, message: "chave aceita" };
    if (r.status === 401 || r.status === 403) return { ok: false, message: `FastPay recusou a chave (HTTP ${r.status})` };
    return { ok: false, message: scrub(`FastPay HTTP ${r.status}${r.body?.message ? `: ${text(r.body.message)}` : ""}`, key) };
  } catch (err) {
    return networkFailure(err, key);
  }
}
