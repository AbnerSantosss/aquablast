import { db } from "@/db";
import { emailLog, type Order } from "@/db/schema";
import { PASSWORD_RESET_TTL_MINUTES } from "@/lib/admin/schemas/auth";
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

/**
 * Link de "Esqueci minha senha" do painel. HTML fixo (não entra nos modelos editáveis).
 * O link só existe no corpo enviado: email_log não tem corpo e o erro é gravado com o link redigido.
 */
export async function sendAdminPasswordResetEmail(to: string, resetUrl: string): Promise<SendResult> {
  const s = await getSettings(["store.name", "email.provider"] as const);
  const store = s["store.name"];
  const subject = `Redefinição de senha do painel - ${store}`;
  const minutes = PASSWORD_RESET_TTL_MINUTES;
  const href = escapeHtml(resetUrl);
  const html = `<div style="margin:0;padding:24px 12px;background:#eaf6fb;font-family:Arial,Helvetica,sans-serif;color:#0f2c3a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;padding:24px 28px;">
    <p style="margin:0 0 14px;font-size:18px;font-weight:700;">Redefinição de senha do painel</p>
    <p style="margin:0 0 14px;">Recebemos um pedido para criar uma nova senha de acesso ao painel <strong>${escapeHtml(store)}</strong>.</p>
    <p style="margin:22px 0;"><a href="${href}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:900;padding:14px 26px;border-radius:999px;font-size:16px;">Criar nova senha</a></p>
    <p style="margin:0 0 8px;">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
    <p style="margin:0 0 14px;font-family:Consolas,monospace;font-size:13px;word-break:break-all;">${href}</p>
    <p style="margin:0 0 14px;">O link vale por ${minutes} minutos e só pode ser usado uma vez.</p>
    <p style="margin:0;">Se você não pediu, ignore este e-mail; sua senha continua a mesma.</p>
  </div>
</div>`;
  const text = [
    "Redefinição de senha do painel",
    "",
    `Recebemos um pedido para criar uma nova senha de acesso ao painel ${store}.`,
    "",
    "Criar nova senha:",
    resetUrl,
    "",
    `O link vale por ${minutes} minutos e só pode ser usado uma vez.`,
    "",
    "Se você não pediu, ignore este e-mail; sua senha continua a mesma.",
  ].join("\n");
  const templateKey = "admin_password_reset";
  const triggeredBy = "system:password-reset";
  try {
    const provider = await getEmailProvider();
    const { messageId } = await provider.send({ to, subject, html, text });
    await db.insert(emailLog).values({ to, templateKey, subject, provider: provider.kind, status: "sent", messageId, triggeredBy });
    return { ok: true };
  } catch (err) {
    // Mensagem do provedor com o link/token redigido (nunca gravar o link).
    const raw = err instanceof Error ? err.message : String(err);
    const message = raw.split(resetUrl).join("[link]").replace(/token=[^\s&"'<>]+/gi, "token=[redigido]").slice(0, 1000);
    await db.insert(emailLog).values({ to, templateKey, subject, provider: s["email.provider"], status: "error", error: message, triggeredBy });
    return { ok: false, error: message };
  }
}
