/**
 * Aviso de entrega com data limite (pedido do dono, 04/10). Config ÚNICA: a faixa do topo, o primeiro bloco do
 * celular, os dois cards de #ofertas e o resumo do checkout leem daqui. Para mudar a data ou o texto, é só aqui.
 *
 * `cutoff` é o último dia em que o aviso vale (dia inteiro, horário de Brasília). Data e alcance ("nas capitais")
 * foram informados pelo dono; não inventar outro prazo.
 */
export const DELIVERY_PROMISE = {
  cutoff: "2026-10-08",
  text: "Peça até 08/10 e receba até o Dia das Crianças (12/10) nas capitais",
} as const;

// Brasília não tem horário de verão: o dia termina em UTC-03:00 o ano todo.
const PROMISE_ENDS_AT = Date.parse(`${DELIVERY_PROMISE.cutoff}T23:59:59.999-03:00`);

/**
 * Texto do aviso enquanto vale; `null` depois da data limite. Chamar só no SERVIDOR (page.tsx) e repassar por
 * prop: assim o HTML já sai com ou sem o aviso (sem erro de hidratação e sem a página pular depois).
 */
export function deliveryPromiseText(now: number = Date.now()): string | null {
  return now <= PROMISE_ENDS_AT ? DELIVERY_PROMISE.text : null;
}
