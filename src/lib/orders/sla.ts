// Prazo de postagem (SLA) dos pedidos pagos. Funções puras: servem ao servidor e a componentes client.
// O prazo conta em horas corridas a partir do pagamento (`paidAt`): `orders.slaDays` dias = slaDays × 24 h.

export type SlaStateName = "no_prazo" | "vence_hoje" | "atrasado";

export interface SlaState {
  state: SlaStateName;
  /** Limite para postar: paidAt + slaDays × 24 h. */
  dueAt: Date;
  /**
   * Dias inteiros restantes até o limite. 0 = vence nas próximas 24 h.
   * Negativo = dias de atraso (mínimo -1 assim que o prazo passa).
   */
  daysLeft: number;
}

const DAY_MS = 86_400_000;

export function slaState(paidAt: Date, slaDays: number, now: Date = new Date()): SlaState {
  const days = Number.isFinite(slaDays) && slaDays > 0 ? slaDays : 3;
  const dueAt = new Date(paidAt.getTime() + days * DAY_MS);
  const diff = dueAt.getTime() - now.getTime();
  if (diff < 0) return { state: "atrasado", dueAt, daysLeft: -Math.max(1, Math.floor(-diff / DAY_MS)) };
  if (diff < DAY_MS) return { state: "vence_hoje", dueAt, daysLeft: 0 };
  return { state: "no_prazo", dueAt, daysLeft: Math.floor(diff / DAY_MS) };
}

/** Início do atraso: pedidos pagos antes deste instante já passaram do prazo. */
export function slaLateCutoff(slaDays: number, now: Date = new Date()): Date {
  const days = Number.isFinite(slaDays) && slaDays > 0 ? slaDays : 3;
  return new Date(now.getTime() - days * DAY_MS);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Texto curto do selo exibido no painel. */
export function slaLabel(s: SlaState): string {
  if (s.state === "atrasado") return `Atrasado ${plural(-s.daysLeft, "dia", "dias")}`;
  if (s.state === "vence_hoje") return "Vence hoje";
  return `No prazo · ${plural(s.daysLeft, "dia", "dias")}`;
}

/** Tom do selo (classes `.tone-*` de admin.css). */
export function slaTone(s: SlaState): "green" | "orange" | "red" {
  return s.state === "atrasado" ? "red" : s.state === "vence_hoje" ? "orange" : "green";
}
