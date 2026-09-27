import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentAttempts } from "@/db/schema";
import { randomToken } from "@/lib/crypto";
import { isProd } from "@/lib/env";
import { cardBrandOf, cardLast4, onlyDigits, validCardExpiry, validLuhn } from "@/lib/checkout/own/masks";
import { getSetting } from "@/lib/settings";
import type { Gateway, StatusResult } from "./types";

/**
 * Gateway SIMULADO (Fase 5.4): desenvolvimento e testes. Não fala com ninguém.
 * - Pix: cria transação pendente com código claramente falso; "pagar" = `simulatePixPaid(transactionId)`
 *   (rota de dev/admin) que muda a linha de payment_attempts, e fetchStatus lê de lá.
 * - Cartão: 4000 0000 0000 0002 → recusado; qualquer outro número válido no Luhn com validade futura → pago.
 * - TRAVA: em produção com `checkout.mode === "proprio"` fica desconfigurado e recusa cobrar.
 */
const REFUSED_CARD = "4000000000000002";

async function allowed(): Promise<boolean> {
  if (!isProd()) return true;
  return (await getSetting("checkout.mode")) !== "proprio";
}

export const simuladoGateway: Gateway = {
  name: "simulado",
  label: "Simulado (teste)",
  supports: { pix: true, card: true },
  tokenizesCard: false,

  configured: allowed,

  async publicConfig() {
    return {};
  },

  async charge(input) {
    if (!(await allowed())) {
      return { ok: false, status: "error", transactionId: null, message: "Pagamento indisponível no momento.", reason: "simulado bloqueado em produção" };
    }
    const transactionId = `sim_${randomToken(8)}`;
    if (input.method === "pix") {
      return {
        ok: true,
        status: "pending",
        transactionId,
        pix: { code: `SIMULADO-NAO-PAGUE-${transactionId}`, expiresAt: new Date(Date.now() + input.pixTtlSeconds * 1000) },
      };
    }
    const card = input.card;
    if (!card) return { ok: false, status: "error", transactionId: null, message: "Dados do cartão não informados.", reason: "card ausente" };
    const number = onlyDigits(card.number);
    if (!validLuhn(number)) return { ok: false, status: "refused", transactionId: null, message: "Número do cartão inválido.", reason: "luhn" };
    if (!validCardExpiry(card.expMonth, card.expYear)) return { ok: false, status: "refused", transactionId: null, message: "Cartão vencido.", reason: "validade" };
    if (number === REFUSED_CARD) {
      return { ok: false, status: "refused", transactionId, cardBrand: cardBrandOf(number), cardLast4: cardLast4(number), message: "Pagamento não autorizado pelo emissor (simulação). Tente outro cartão.", reason: "cartão de teste recusado" };
    }
    return { ok: true, status: "paid", transactionId, cardBrand: cardBrandOf(number), cardLast4: cardLast4(number) };
  },

  async fetchStatus(transactionId): Promise<StatusResult> {
    const row = await db.query.paymentAttempts.findFirst({ where: and(eq(paymentAttempts.provider, "simulado"), eq(paymentAttempts.providerTransactionId, transactionId)) });
    if (!row) return { status: "error", reason: "transação simulada não encontrada" };
    const status = row.status;
    if (status === "paid" || status === "pending" || status === "refused" || status === "canceled" || status === "refunded") {
      return { status, paidAt: status === "paid" ? row.updatedAt : null };
    }
    return { status: "error", reason: `status desconhecido: ${status}` };
  },

  async refund() {
    return { ok: true };
  },

  extractWebhook(payload) {
    const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const id = p.transactionId ?? p.transaction_hash;
    return { transactionId: typeof id === "string" ? id : null };
  },
};

/**
 * Só dev/teste: marca a tentativa de Pix simulada como paga. Quem chama deve em seguida rodar o mesmo fluxo
 * do postback (fetchStatus → applyPaymentStatus → markCartConverted + Purchase).
 */
export async function simulatePixPaid(transactionId: string): Promise<boolean> {
  if (!(await allowed())) return false;
  const [row] = await db
    .update(paymentAttempts)
    .set({ status: "paid", updatedAt: new Date() })
    .where(and(eq(paymentAttempts.provider, "simulado"), eq(paymentAttempts.providerTransactionId, transactionId)))
    .returning();
  return !!row;
}
