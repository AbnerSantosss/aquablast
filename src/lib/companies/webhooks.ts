import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companyWebhookDeliveries, orders } from "@/db/schema";
import { companyIdOf, getCompanyById } from "@/lib/companies";
import { decryptText } from "@/lib/crypto";
import { errorMessage, log } from "@/lib/log";

/**
 * Webhook de saída da empresa (eventos order.paid e order.shipped).
 * Corpo JSON assinado com HMAC-SHA256 usando o webhook_secret da empresa:
 *   X-Gateway-Signature: t=<unix>,v1=<hex(hmac_sha256(secret, `${t}.${corpo}`))>
 * Nunca lança e nunca deve ser aguardado pelo fluxo principal: `void notifyCompanyWebhook(orderId, evento)`.
 */

export type CompanyWebhookEvent = "order.paid" | "order.shipped";

const ATTEMPT_DELAYS_MS = [0, 2_000, 8_000];
const TIMEOUT_MS = 8_000;

export function signWebhookBody(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function validTarget(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}

export async function notifyCompanyWebhook(orderId: string, event: CompanyWebhookEvent): Promise<void> {
  try {
    const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
    if (!order) return;
    const company = await getCompanyById(companyIdOf(order));
    if (!company || !company.active || !company.webhookUrl || !company.webhookSecret) return;
    if (!validTarget(company.webhookUrl)) {
      await db.insert(companyWebhookDeliveries).values({ companyId: company.id, orderId, event, status: "failed", error: "URL do webhook inválida (use https)." });
      return;
    }
    const secret = decryptText(company.webhookSecret);

    const [delivery] = await db.insert(companyWebhookDeliveries).values({ companyId: company.id, orderId, event }).returning({ id: companyWebhookDeliveries.id });

    const payload = {
      id: delivery.id,
      event,
      createdAt: new Date().toISOString(),
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        amountTotal: order.amountTotal,
        currency: order.currency,
        items: order.items,
        paidAt: order.paidAt,
        tracking: { code: order.trackingCode, url: order.trackingUrl, carrier: order.carrierName },
      },
    };
    const body = JSON.stringify(payload);
    await db.update(companyWebhookDeliveries).set({ payload }).where(eq(companyWebhookDeliveries.id, delivery.id));

    let attempts = 0;
    let lastStatus: number | null = null;
    let lastError: string | null = null;
    for (const delay of ATTEMPT_DELAYS_MS) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      attempts += 1;
      const t = Math.floor(Date.now() / 1000);
      try {
        const res = await fetch(company.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "AquaBlast-Gateway/1",
            "X-Gateway-Event": event,
            "X-Gateway-Delivery": delivery.id,
            "X-Gateway-Signature": `t=${t},v1=${signWebhookBody(secret, t, body)}`,
          },
          body,
          redirect: "manual",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        lastStatus = res.status;
        lastError = res.ok ? null : `HTTP ${res.status}`;
        if (res.ok) break;
      } catch (err) {
        lastError = errorMessage(err).slice(0, 300);
      }
    }
    const ok = lastError === null;
    await db
      .update(companyWebhookDeliveries)
      .set({ status: ok ? "delivered" : "failed", attempts, responseStatus: lastStatus, error: lastError, deliveredAt: ok ? new Date() : null })
      .where(eq(companyWebhookDeliveries.id, delivery.id));
  } catch (err) {
    log.error("webhook de empresa falhou", { orderId, event, error: errorMessage(err) });
  }
}
