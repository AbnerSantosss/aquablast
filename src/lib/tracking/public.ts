// O que o CLIENTE vê do rastreio (pedido do dono, 2026-10-02): nada que revele de onde o produto sai.
// O banco e o /admin continuam com o nome real da transportadora, o código e o texto original dos eventos;
// a limpeza acontece só na saída pública (/rastrear e e-mails), então vale também para eventos já gravados.
import type { OrderEvent } from "@/db/schema";

/** Nome mostrado ao cliente no lugar da transportadora real. */
export const PUBLIC_CARRIER_LABEL = "Transportadora parceira";

export interface PublicEvent {
  id: string;
  occurredAt: string;
  title: string;
  description: string;
}

/** Eventos de sistema da transportadora que não dizem nada ao cliente. */
const INTERNAL = [/SLSTN/i, /system reminder/i, /not in use/i, /no need edit/i, /sending request to logistic/i];

/** Frases em inglês já vistas, com tradução. O que não estiver aqui e for inglês cai no texto genérico. */
const TRANSLATIONS: [RegExp, string][] = [
  [/loaded into truck/i, "Pacote carregado no caminhão, saindo do centro de coleta."],
  [/out for delivery/i, "Pedido em rota de entrega."],
  [/\bdelivered\b/i, "Pedido entregue."],
  [/picked up/i, "Pedido coletado pela transportadora."],
];

const GENERIC_DESCRIPTION = "Movimentação registrada pela transportadora.";

/** Palavras que só aparecem em texto em inglês; duas ou mais diferentes = evento em inglês. */
const ENGLISH_WORDS = /\b(the|has|been|is|are|was|will|your|with|from|and|into|soon|parcel|package|shipment|at|to|of|by|on|order|arrived|departed|received|sorting|hub|facility|station|courier|driver|successfully)\b/gi;

const BRAND = /\b(shopee\s*(express|xpress)?|spx(\s*(express|xpress))?)\b/gi;

function isEnglish(text: string): boolean {
  const hits = new Set((text.match(ENGLISH_WORDS) ?? []).map((w) => w.toLowerCase()));
  return hits.size >= 2;
}

/** Tira o nome da transportadora de um texto e arruma o que sobra (espaço duplo, colchete vazio, pontuação solta). */
export function scrubCarrierBrand(text: string): string {
  return text
    .replace(BRAND, "")
    .replace(/[[(]\s*[\])]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/^[\s\-—:,.]+/, "")
    .trim();
}

/** Texto do evento da transportadora como o cliente vai ler; `null` = evento escondido. */
function publicCarrierDescription(stored: string): string | null {
  if (INTERNAL.some((re) => re.test(stored))) return null;
  // provider.ts grava "descrição — local".
  const cut = stored.lastIndexOf(" — ");
  const text = cut > 0 ? stored.slice(0, cut) : stored;
  const location = cut > 0 ? scrubCarrierBrand(stored.slice(cut + 3)) : "";
  const known = TRANSLATIONS.find(([re]) => re.test(text));
  if (known) return location ? `${known[1].replace(/\.$/, "")} — ${location}` : known[1];
  if (isEnglish(text)) return GENERIC_DESCRIPTION;
  return scrubCarrierBrand(stored) || GENERIC_DESCRIPTION;
}

/**
 * Linha do tempo pública, do mais recente para o mais antigo. Eventos da transportadora (dedupeKey "t:...")
 * passam pela limpeza; os demais (pagamento, painel, mudança de status) saem como estão.
 * "Entregue" e "Saiu para entrega" chegam duas vezes — o evento da transportadora e o da mudança de status
 * ("ts:..."): fica só o da mudança de status, que já tem texto nosso. A comparação é só pelo status, sem a data:
 * a mudança de status é gravada com a data do último evento do lote (sync.ts), que pode não ser o da entrega.
 */
export function toPublicEvents(events: OrderEvent[]): PublicEvent[] {
  const transitions = new Set(events.filter((e) => e.dedupeKey?.startsWith("ts:") && e.status).map((e) => e.status));
  const out: PublicEvent[] = [];
  for (const e of events.slice().sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())) {
    let title = e.title;
    let description = e.description;
    if (e.source === "tracking" && e.dedupeKey?.startsWith("t:")) {
      const duplicated = (e.status === "delivered" || e.status === "out_for_delivery") && transitions.has(e.status);
      if (duplicated) continue;
      const clean = publicCarrierDescription(description);
      if (clean === null) continue;
      description = clean;
      title = scrubCarrierBrand(title) || "Atualização da entrega";
    }
    out.push({ id: e.id, occurredAt: e.occurredAt.toISOString(), title, description });
  }
  return out;
}
