import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { settings } from "@/db/schema";

/**
 * WhatsApp de suporte exibido no site (rodapé, /trocas-e-devolucoes e
 * `contactPoint.telephone` do JSON-LD). O dono cadastra em Painel > Configurações >
 * Loja; enquanto não cadastrar, o site não mostra WhatsApp nenhum.
 *
 * Por que não usar getSetting() de src/lib/settings.ts: ele devolve o DEFAULT do
 * código ("5581996584578", nunca confirmado pelo dono) quando não há linha no banco,
 * e esse número não pode ir para o site. Aqui a linha é lida direto, sem default.
 * Os e-mails continuam usando getSetting() (comportamento inalterado).
 */
export const SUPPORT_WHATSAPP_KEY = "store.supportWhatsapp";

/** DDI + DDD + número: 10 a 15 dígitos (E.164 tem no máximo 15). */
const VALID_DIGITS = /^\d{10,15}$/;

/** Sem resposta do banco nesse tempo, a página sai sem WhatsApp (não trava o render). */
const DB_TIMEOUT_MS = 3000;

export interface SupportWhatsapp {
  /** Só dígitos, com DDI. Ex.: "5511900000000". */
  digits: string;
  /** Link de conversa: https://wa.me/<dígitos>. */
  href: string;
  /** Texto exibido: "(11) 90000-0000" para número do Brasil, senão "+<dígitos>". */
  label: string;
  /** Para o JSON-LD: "+<dígitos>". */
  telephone: string;
}

/**
 * O jsonb volta do Drizzle já com JSON.parse aplicado de novo sobre a string do pg:
 * "5511900000000" gravado como texto chega aqui como NÚMERO. Por isso aceita string
 * ou inteiro seguro (15 dígitos cabem; DDI nunca começa com 0).
 */
function storedToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return "";
}

/** Linha gravada, sem default. `exists: false` = o dono nunca salvou o campo. */
export interface StoredSupportWhatsapp {
  exists: boolean;
  /** Valor gravado em texto ("" se vazio, cifrado ou de outro tipo). */
  value: string;
}

/**
 * Lê a linha `store.supportWhatsapp` como está no banco. Para o painel e a action
 * de salvar: erros de banco sobem (o painel já depende do banco para abrir).
 */
export async function getStoredSupportWhatsapp(): Promise<StoredSupportWhatsapp> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, SUPPORT_WHATSAPP_KEY) });
  if (!row) return { exists: false, value: "" };
  return { exists: true, value: row.encrypted ? "" : storedToText(row.value) };
}

/** "5511900000000" -> "(11) 90000-0000"; fora do padrão do Brasil -> "+<dígitos>". */
function formatLabel(digits: string): string {
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  if (br) return `(${br[1]}) ${br[2]}-${br[3]}`;
  return `+${digits}`;
}

/** Aceita só dígitos (10 a 15). Qualquer outra coisa = sem WhatsApp no site. */
export function toSupportWhatsapp(raw: string): SupportWhatsapp | null {
  const digits = raw.trim();
  if (!VALID_DIGITS.test(digits)) return null;
  return {
    digits,
    href: `https://wa.me/${digits}`,
    label: formatLabel(digits),
    telephone: `+${digits}`,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * WhatsApp para o site, ou `null` quando: não há linha, valor vazio, inválido,
 * cifrado, ou QUALQUER erro (no `next build` do CI não há banco e o env() pode
 * lançar: a página estática sai sem WhatsApp e o ISR preenche depois).
 * `cache` do React: uma leitura por render, mesmo se chamado em mais de um lugar.
 */
export const getSupportWhatsapp = cache(async (): Promise<SupportWhatsapp | null> => {
  try {
    const stored = await withTimeout(getStoredSupportWhatsapp(), DB_TIMEOUT_MS);
    if (!stored.exists) return null;
    return toSupportWhatsapp(stored.value);
  } catch {
    return null;
  }
});
