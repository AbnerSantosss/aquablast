import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailTemplates, type EmailTemplate } from "@/db/schema";

export type TemplateKey = "order_confirmed" | "pix_pending" | "pix_reminder" | "shipped" | "out_for_delivery" | "delivered" | "access_code";

/** Placeholders aceitos no assunto e no corpo. Documentados na tela de edição. */
export const PLACEHOLDERS = [
  "{{nome}}",
  "{{primeiro_nome}}",
  "{{pedido}}",
  "{{codigo_acesso}}",
  "{{link_rastreio}}",
  "{{codigo_transportadora}}",
  "{{transportadora}}",
  "{{pix_copia_cola}}",
  "{{link_pagamento}}",
  "{{valor}}",
  "{{itens}}",
  "{{loja}}",
  "{{whatsapp}}",
  "{{email_suporte}}",
] as const;

const wrap = (inner: string) => `
<div style="margin:0;padding:24px 12px;background:#eaf6fb;font-family:'Nunito',Arial,Helvetica,sans-serif;color:#0f2c3a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(15,44,58,.10);">
    <div style="background:linear-gradient(135deg,#0ea5e9,#22d3ee);padding:22px 28px;color:#fff;">
      <div style="font-size:22px;font-weight:900;letter-spacing:.3px;">{{loja}}</div>
      <div style="font-size:13px;opacity:.9;">Diversão garantida neste Dia das Crianças 💦</div>
    </div>
    <div style="padding:26px 28px;font-size:16px;line-height:1.55;">
      ${inner}
    </div>
    <div style="padding:16px 28px 22px;background:#f4fbfe;font-size:13px;color:#4b6675;">
      Dúvidas? Fale com a gente no WhatsApp <a href="https://wa.me/{{whatsapp}}" style="color:#0284c7;font-weight:700;">{{whatsapp}}</a> ou responda este e-mail ({{email_suporte}}).
    </div>
  </div>
</div>`;

const btn = (href: string, label: string) =>
  `<p style="margin:22px 0;"><a href="${href}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:900;padding:14px 26px;border-radius:999px;font-size:16px;">${label}</a></p>`;

const code = (v: string) =>
  `<p style="margin:14px 0;padding:14px 16px;background:#f1f5f9;border:1px dashed #94a3b8;border-radius:12px;font-family:Consolas,monospace;font-size:15px;word-break:break-all;">${v}</p>`;

export const DEFAULT_TEMPLATES: Record<TemplateKey, { name: string; description: string; subject: string; bodyHtml: string; enabled: boolean }> = {
  order_confirmed: {
    name: "Pagamento confirmado",
    description: "Enviado automaticamente quando o checkout confirma o pagamento. Leva o código de acesso ao rastreio.",
    subject: "Pedido {{pedido}} confirmado! Seu AquaBlast já está a caminho 💦",
    enabled: true,
    bodyHtml: wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Oba, {{primeiro_nome}}! Pagamento confirmado 🎉</h1>
      <p>Recebemos o pagamento do pedido <strong>{{pedido}}</strong>. Agora é com a gente: vamos separar e embalar seu AquaBlast com todo cuidado.</p>
      <p><strong>Itens:</strong><br>{{itens}}</p>
      <p><strong>Total:</strong> {{valor}}</p>
      <p>Para acompanhar cada etapa da entrega, use o seu código de acesso:</p>
      ${code("{{codigo_acesso}}")}
      ${btn("{{link_rastreio}}", "Acompanhar meu pedido")}
      <p style="font-size:14px;color:#4b6675;">Guarde este e-mail: o código é pessoal e serve para acompanhar o pedido até a entrega.</p>
    `),
  },
  pix_pending: {
    name: "Pix gerado (aguardando pagamento)",
    description: "Enviado quando o checkout cria um pedido com Pix pendente. Contém o código copia-e-cola.",
    subject: "Seu Pix do pedido {{pedido}} está pronto para pagar",
    enabled: true,
    bodyHtml: wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Falta só um passo, {{primeiro_nome}}!</h1>
      <p>Seu pedido <strong>{{pedido}}</strong> foi reservado. Para garantir o AquaBlast, pague o Pix abaixo (copia e cola):</p>
      ${code("{{pix_copia_cola}}")}
      ${btn("{{link_pagamento}}", "Abrir página de pagamento")}
      <p style="font-size:14px;color:#4b6675;">Assim que o pagamento for confirmado, você recebe outro e-mail com o código para acompanhar a entrega.</p>
    `),
  },
  pix_reminder: {
    name: "Lembrete de Pix (remarketing)",
    description: "Reenvio do Pix para quem não pagou. Pode ser automático (Configurações → Lembrete de Pix) ou manual no pedido.",
    subject: "{{primeiro_nome}}, seu AquaBlast ainda está reservado 💧",
    enabled: true,
    bodyHtml: wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Ainda dá tempo, {{primeiro_nome}}!</h1>
      <p>Notamos que o pagamento do pedido <strong>{{pedido}}</strong> ainda não foi concluído. Reservamos o seu AquaBlast, mas o estoque para o Dia das Crianças é limitado.</p>
      <p>Pague com o Pix copia e cola:</p>
      ${code("{{pix_copia_cola}}")}
      ${btn("{{link_pagamento}}", "Finalizar meu pedido")}
      <p style="font-size:14px;color:#4b6675;">Se você já pagou, ignore este e-mail: a confirmação chega em instantes.</p>
    `),
  },
  shipped: {
    name: "Pedido enviado",
    description: "Enviado quando o pedido é postado (código de rastreio cadastrado).",
    subject: "Seu pedido {{pedido}} foi enviado 🚚",
    enabled: true,
    bodyHtml: wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Seu AquaBlast está a caminho, {{primeiro_nome}}!</h1>
      <p>O pedido <strong>{{pedido}}</strong> foi entregue à transportadora <strong>{{transportadora}}</strong>.</p>
      <p><strong>Código de rastreio:</strong> {{codigo_transportadora}}</p>
      <p>Acompanhe a entrega em tempo real com o seu código de acesso:</p>
      ${code("{{codigo_acesso}}")}
      ${btn("{{link_rastreio}}", "Acompanhar entrega")}
    `),
  },
  out_for_delivery: {
    name: "Saiu para entrega",
    description: "Enviado quando a transportadora informa que o pedido saiu para entrega.",
    subject: "Chega hoje! Pedido {{pedido}} saiu para entrega 🎁",
    enabled: true,
    bodyHtml: wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Prepare a criançada, {{primeiro_nome}}!</h1>
      <p>O entregador já está com o pedido <strong>{{pedido}}</strong>. Fique de olho na campainha.</p>
      ${btn("{{link_rastreio}}", "Ver status da entrega")}
    `),
  },
  delivered: {
    name: "Pedido entregue",
    description: "Enviado quando a entrega é confirmada.",
    subject: "Entregue! Boa diversão com o AquaBlast 💦",
    enabled: true,
    bodyHtml: wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Entregue, {{primeiro_nome}}! 🎉</h1>
      <p>O pedido <strong>{{pedido}}</strong> foi entregue. Esperamos que a brincadeira seja inesquecível.</p>
      <p>Qualquer dúvida sobre o produto, fale com a gente pelo WhatsApp. Estamos por aqui!</p>
    `),
  },
  access_code: {
    name: "Reenvio do código de acesso",
    description: "Disparado manualmente no painel quando o cliente perdeu o código de acompanhamento.",
    subject: "Seu código de acesso ao pedido {{pedido}}",
    enabled: true,
    bodyHtml: wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Aqui está seu código, {{primeiro_nome}}</h1>
      <p>Use o código abaixo para acompanhar o pedido <strong>{{pedido}}</strong>:</p>
      ${code("{{codigo_acesso}}")}
      ${btn("{{link_rastreio}}", "Acompanhar meu pedido")}
      <p style="font-size:14px;color:#4b6675;">Os códigos anteriores deixaram de valer.</p>
    `),
  },
};

export async function ensureDefaultTemplates(): Promise<void> {
  for (const [key, t] of Object.entries(DEFAULT_TEMPLATES)) {
    await db
      .insert(emailTemplates)
      .values({ key, name: t.name, description: t.description, subject: t.subject, bodyHtml: t.bodyHtml, enabled: t.enabled })
      .onConflictDoNothing();
  }
}

export async function getTemplate(key: TemplateKey): Promise<EmailTemplate> {
  const row = await db.query.emailTemplates.findFirst({ where: eq(emailTemplates.key, key) });
  if (row) return row;
  const d = DEFAULT_TEMPLATES[key];
  return { key, name: d.name, description: d.description, subject: d.subject, bodyHtml: d.bodyHtml, enabled: d.enabled, updatedAt: new Date() };
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  await ensureDefaultTemplates();
  const rows = await db.query.emailTemplates.findMany();
  const order = Object.keys(DEFAULT_TEMPLATES);
  return rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

export function renderTemplate(source: string, vars: Record<string, string>): string {
  return source.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => vars[k] ?? "");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
