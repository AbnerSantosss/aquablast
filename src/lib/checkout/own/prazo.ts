import type { ShippingMethod } from "@/lib/checkout/own/shipping";

/** Capitais das UFs (sem acento, minúsculas), para escolher a faixa de prazo pelo endereço. */
const CAPITAIS: Record<string, string> = {
  AC: "rio branco", AL: "maceio", AP: "macapa", AM: "manaus", BA: "salvador", CE: "fortaleza", DF: "brasilia",
  ES: "vitoria", GO: "goiania", MA: "sao luis", MT: "cuiaba", MS: "campo grande", MG: "belo horizonte",
  PA: "belem", PB: "joao pessoa", PR: "curitiba", PE: "recife", PI: "teresina", RJ: "rio de janeiro",
  RN: "natal", RS: "porto alegre", RO: "porto velho", RR: "boa vista", SC: "florianopolis", SP: "sao paulo",
  SE: "aracaju", TO: "palmas",
};

const semAcento = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Prazo em dias úteis por tipo de frete. Vem do dono (2026-10-14): grátis 4-7 e 7-10; FULL 2-3 e 8-9. */
const PRAZO: Record<ShippingMethod, { capital: string; demais: string }> = {
  free: { capital: "4 a 7 dias úteis", demais: "7 a 10 dias úteis" },
  full: { capital: "2 a 3 dias úteis", demais: "8 a 9 dias úteis" },
};

/** true se a cidade é a capital da UF, false se não é, null sem cidade e UF válidos (CEP ainda não consultado). */
export function ehCapital(cidade: string, uf: string): boolean | null {
  const sigla = uf.trim().toUpperCase();
  if (!CAPITAIS[sigla] || !cidade.trim()) return null;
  return semAcento(cidade) === CAPITAIS[sigla];
}

/** Texto de prazo para a opção de frete; sem cidade e UF válidos, devolve null (o checkout mostra o texto padrão). */
export function prazoDeEntrega(metodo: ShippingMethod, cidade: string, uf: string): string | null {
  const capital = ehCapital(cidade, uf);
  if (capital === null) return null;
  return capital ? PRAZO[metodo].capital : PRAZO[metodo].demais;
}
