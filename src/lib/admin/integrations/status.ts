import { getSetting, setSetting, type IntegrationStatusEntry, type IntegrationStatusMap } from "@/lib/settings";

/**
 * Status da última verificação REAL de cada integração, guardado em `integrations.status` (jsonb).
 * O selo verde "Conectado" do painel (SecretField) só aparece com `ok: true` gravado aqui.
 *
 * Regras (pedido 2026-09-30-rastreio-sla-pix-qr-bump-cor-pixels):
 * - Trocou o segredo -> `clearIntegrationStatus(key)` antes de verificar de novo (status velho não vale para chave nova).
 * - `message` é curta e NUNCA ecoa a chave/token (vai para o HTML do painel).
 */
export const INTEGRATION_KEYS = ["email", "meta", "gateway.mercadopago", "gateway.ironpay", "gateway.fastpay", "tracking.17track"] as const;
export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

const MAX_MESSAGE = 160;

function isEntry(v: unknown): v is IntegrationStatusEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return typeof e.ok === "boolean" && typeof e.at === "string" && (e.message === undefined || typeof e.message === "string");
}

async function readAll(): Promise<IntegrationStatusMap> {
  const raw = await getSetting("integrations.status");
  const out: IntegrationStatusMap = {};
  for (const [k, v] of Object.entries(raw ?? {})) if (isEntry(v)) out[k] = v;
  return out;
}

/** Sem argumento: o mapa inteiro. Com chave: o status daquela integração (ou `undefined` se nunca verificada). */
export async function getIntegrationStatus(): Promise<IntegrationStatusMap>;
export async function getIntegrationStatus(key: IntegrationKey): Promise<IntegrationStatusEntry | undefined>;
export async function getIntegrationStatus(key?: IntegrationKey): Promise<IntegrationStatusMap | IntegrationStatusEntry | undefined> {
  const all = await readAll();
  return key ? all[key] : all;
}

/** Grava o resultado de uma verificação (carimba `at` com agora, em ISO). Devolve o que gravou. */
export async function setIntegrationStatus(
  key: IntegrationKey,
  result: { ok: boolean; message?: string },
  updatedBy = "system",
): Promise<IntegrationStatusEntry> {
  const entry: IntegrationStatusEntry = { ok: result.ok, at: new Date().toISOString() };
  const msg = result.message?.trim();
  if (msg) entry.message = msg.length > MAX_MESSAGE ? msg.slice(0, MAX_MESSAGE - 1) + "…" : msg;
  const all = await readAll();
  all[key] = entry;
  await setSetting("integrations.status", all, updatedBy);
  return entry;
}

/** Apaga o status (segredo trocado ou removido): o selo volta a "Salvo, não verificado". */
export async function clearIntegrationStatus(key: IntegrationKey, updatedBy = "system"): Promise<void> {
  const all = await readAll();
  if (!(key in all)) return;
  delete all[key];
  await setSetting("integrations.status", all, updatedBy);
}
