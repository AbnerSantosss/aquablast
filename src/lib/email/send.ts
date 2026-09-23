import { db } from "@/db";
import { emailLog, type Order } from "@/db/schema";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { getEmailProvider } from "./provider";
import { escapeHtml, getTemplate, htmlToText, renderTemplate, type TemplateKey } from "./templates";

function formatBRL(v: string | number | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function buildVars(order: Order, extra: { accessCode?: string } = {}): Promise<Record<string, string>> {
  const s = await getSettings(["store.name", "store.supportWhatsapp", "store.supportEmail", "store.trackingPageUrl"] as const);
  const base = env().APP_URL.replace(/\/$/, "");
  const trackingPath = s["store.trackingPageUrl"].startsWith("http") ? s["store.trackingPageUrl"] : base + s["store.trackingPageUrl"];
  const link = extra.accessCode ? `${trackingPath}?codigo=${encodeURIComponent(extra.accessCode)}` : trackingPath;
  const name = order.customerName ?? "";
  const items = (order.items ?? []).map((i) => `${i.quantity}× ${escapeHtml(i.name)}${i.variant ? ` (${escapeHtml(i.variant)})` : ""}`).join("<br>");
  return {
    nome: escapeHtml(name),
    primeiro_nome: escapeHtml(name.split(/\s+/)[0] ?? ""),
    pedido: escapeHtml(order.orderNumber),
    codigo_acesso: escapeHtml(extra.accessCode ?? ""),
    link_rastreio: link,
    codigo_transportadora: escapeHtml(order.trackingCode ?? ""),
    transportadora: escapeHtml(order.carrierName ?? ""),
    pix_copia_cola: escapeHtml(order.pixCode ?? ""),
    link_pagamento: order.paymentUrl ?? "",
    valor: formatBRL(order.amountTotal),
    itens: items,
    loja: escapeHtml(s["store.name"]),
    whatsapp: escapeHtml(s["store.supportWhatsapp"]),
    email_suporte: escapeHtml(s["store.supportEmail"]),
  };
}

export interface SendResult {
  ok: boolean;
  error?: string;
  skipped?: string;
}

/**
 * Envia um template para o comprador do pedido. `automatic=true` respeita o toggle `enabled`
 * do template; envio manual pelo painel ignora o toggle.
 */
export async function sendOrderEmail(
  order: Order,
  templateKey: TemplateKey,
  opts: { accessCode?: string; automatic?: boolean; triggeredBy?: string } = {},
): Promise<SendResult> {
  if (!order.customerEmail) return { ok: false, skipped: "Pedido sem e-mail do cliente" };
  const tpl = await getTemplate(templateKey);
  if (opts.automatic && !tpl.enabled) return { ok: false, skipped: "Envio automático desligado para este template" };

  const vars = await buildVars(order, { accessCode: opts.accessCode });
  const subject = renderTemplate(tpl.subject, vars);
  const html = renderTemplate(tpl.bodyHtml, vars);
  const s = await getSettings(["email.provider", "email.replyTo"] as const);
  const triggeredBy = opts.triggeredBy ?? "system";

  try {
    const provider = await getEmailProvider();
    const { messageId } = await provider.send({ to: order.customerEmail, subject, html, text: htmlToText(html), replyTo: s["email.replyTo"] });
    await db.insert(emailLog).values({ orderId: order.id, to: order.customerEmail, templateKey, subject, provider: provider.kind, status: "sent", messageId, triggeredBy });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(emailLog).values({ orderId: order.id, to: order.customerEmail, templateKey, subject, provider: s["email.provider"], status: "error", error: message, triggeredBy });
    return { ok: false, error: message };
  }
}

/** E-mail de teste da tela de configurações (não usa template de pedido). */
export async function sendTestEmail(to: string, triggeredBy: string): Promise<SendResult> {
  const s = await getSettings(["store.name", "email.provider"] as const);
  const subject = `Teste de envio - ${s["store.name"]}`;
  const html = `<p>Este é um e-mail de teste do painel <strong>${escapeHtml(s["store.name"])}</strong>. Se você recebeu, o provedor está configurado corretamente.</p>`;
  try {
    const provider = await getEmailProvider();
    await provider.verify();
    const { messageId } = await provider.send({ to, subject, html, text: htmlToText(html) });
    await db.insert(emailLog).values({ to, templateKey: "test", subject, provider: provider.kind, status: "sent", messageId, triggeredBy });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(emailLog).values({ to, templateKey: "test", subject, provider: s["email.provider"], status: "error", error: message, triggeredBy });
    return { ok: false, error: message };
  }
}
