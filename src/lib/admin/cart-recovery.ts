// Funções puras do remarketing de carrinhos no painel: formatação da régua, "próximo passo" e mensagem de WhatsApp.
// Sem banco e sem relógio próprio: quem chama passa `now`. Não muda a regra de envio (essa é de src/lib/email/abandoned.ts).
import { selectionFromCart, titleOf, variantOf } from "@/lib/checkout/own/catalog";
import type { CheckoutCart } from "@/db/schema";
import type { RecoveryPlan } from "./queries-checkout";

type CartLike = Pick<
  CheckoutCart,
  "status" | "step" | "pack" | "colors" | "customerName" | "customerEmail" | "customerPhone" | "recoveryEmailCount" | "unsubscribedAt" | "lastActivityAt" | "token"
>;

const ORDINAL = ["1º", "2º", "3º"] as const;

/** 30 → "30 min", 1440 → "24 h", 4320 → "3 dias", 90 → "1 h 30 min", 0 → "desligado". */
export function formatMinutes(total: number): string {
  const m = Math.round(total);
  if (m <= 0) return "desligado";
  if (m < 60) return `${m} min`;
  if (m % 1440 === 0 && m >= 2880) return `${m / 1440} dias`;
  if (m % 60 === 0) return `${m / 60} h`;
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  return [d ? `${d} d` : "", h ? `${h} h` : "", min ? `${min} min` : ""].filter(Boolean).join(" ");
}

/** "15/10 18:30" no horário de São Paulo. */
function formatShort(d: Date): string {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("day")}/${p("month")} ${p("hour")}:${p("minute")}`;
}

/**
 * O que a régua automática vai fazer com este carrinho, em uma frase curta.
 * Segue as mesmas condições de `runAbandonedCarts`: precisa de e-mail, não estar descadastrado nem convertido,
 * ter menos de 3 e-mails enviados, e o tempo do próximo e-mail contar a partir de `lastActivityAt`.
 */
export function nextStepLabel(cart: CartLike, plan: RecoveryPlan, now: Date): string {
  if (cart.status === "converted" || cart.status === "recovered") return "—";
  if (cart.unsubscribedAt) return "Descadastrado";
  if (!cart.customerEmail) return cart.customerPhone ? "Só WhatsApp" : "Sem contato";
  if (cart.recoveryEmailCount >= 3) return "Régua concluída";
  if (!plan.enabled) return "Régua desligada";
  const idx = Math.max(0, cart.recoveryEmailCount);
  const label = ORDINAL[idx];
  const minutes = plan.minutes[idx];
  if (!minutes || minutes <= 0) return `${label} e-mail desligado`;
  const due = new Date(cart.lastActivityAt.getTime() + minutes * 60_000);
  return due > now ? `${label} e-mail em ${formatShort(due)}` : `${label} e-mail na próxima rodada`;
}

const STEP_PHRASE: Record<CheckoutCart["step"], string> = {
  dados: "dados",
  entrega: "entrega",
  pagamento: "pagamento",
  concluido: "finalização",
};

/**
 * Mensagem de WhatsApp de recuperação manual: primeiro nome (se houver), produto, etapa onde parou e o
 * link para continuar. Sem desconto e sem promessa.
 */
export function recoveryWhatsappText(cart: CartLike, baseUrl: string): string {
  const first = (cart.customerName ?? "").trim().split(/\s+/)[0] ?? "";
  const sel = selectionFromCart(cart);
  const produto = `${titleOf(sel)}, ${variantOf(sel)}`;
  const link = `${baseUrl.replace(/\/$/, "")}/checkout/pedido/${cart.token}?utm_source=whatsapp&utm_medium=recuperacao&utm_campaign=manual`;
  const saudacao = first ? `Oi, ${first}! Aqui é da AquaBlast.` : "Oi! Aqui é da AquaBlast.";
  return `${saudacao} Vi que sua compra (${produto}) ficou parada na etapa de ${STEP_PHRASE[cart.step]}. Posso te ajudar com alguma dúvida? Se quiser continuar de onde parou: ${link}`;
}
