import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { emailTemplates, type EmailTemplate } from "@/db/schema";

export type TemplateKey =
  | "order_confirmed"
  | "pix_pending"
  | "pix_reminder"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception"
  | "access_code"
  | "cart_abandoned_1"
  | "cart_abandoned_2"
  | "cart_abandoned_3"
  | "payment_refused"
  | "pix_expired"
  | "admin_sla_atrasado";

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
  "{{link_carrinho}}",
  "{{etapa}}",
  "{{link_descadastro}}",
  "{{link_transportadora}}",
  "{{cliente}}",
  "{{pago_em}}",
  "{{dias_atraso}}",
  "{{prazo_dias}}",
  "{{link_admin}}",
  "{{status}}",
  "{{progresso}}",
  "{{bloco_rastreio}}",
  "{{bloco_acesso}}",
  "{{mensagem}}",
] as const;

/**
 * Frase da campanha exibida no cabeçalho de todo e-mail. Depois de 12/10 (Dia das Crianças) esta
 * frase fica desatualizada e precisa ser trocada pelo dono (pendência registrada na wiki).
 */
export const EMAIL_TAGLINE = "Diversão garantida neste Dia das Crianças 💦";

const wrap = (inner: string) => `
<div style="margin:0;padding:24px 12px;background:#eaf6fb;font-family:'Nunito',Arial,Helvetica,sans-serif;color:#0f2c3a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(15,44,58,.10);">
    <div style="background:linear-gradient(135deg,#0ea5e9,#22d3ee);padding:22px 28px;color:#fff;">
      <div style="font-size:22px;font-weight:900;letter-spacing:.3px;">{{loja}}</div>
      <div style="font-size:13px;opacity:.9;">${EMAIL_TAGLINE}</div>
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

/** Moldura dos e-mails internos (para a equipe): sem a frase da campanha nem o rodapé de suporte ao cliente. */
const wrapInternal = (inner: string) => `
<div style="margin:0;padding:24px 12px;background:#eaf6fb;font-family:Arial,Helvetica,sans-serif;color:#0f2c3a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;padding:24px 28px;font-size:15px;line-height:1.55;">
    <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#4b6675;">Painel {{loja}} · aviso interno</p>
    ${inner}
  </div>
</div>`;

/** Link discreto para o site da transportadora (fica abaixo do botão principal de rastreio). */
const carrierLink = (href: string) =>
  `<p style="margin:0 0 14px;font-size:14px;">Ou acompanhe direto no site da transportadora: <a href="${href}" style="color:#0284c7;font-weight:700;">abrir rastreio da {{transportadora}}</a></p>`;

const code = (v: string) =>
  `<p style="margin:14px 0;padding:14px 16px;background:#f1f5f9;border:1px dashed #94a3b8;border-radius:12px;font-family:Consolas,monospace;font-size:15px;word-break:break-all;">${v}</p>`;

/** Linha pequena acima do título dos e-mails de status: "Pedido AQB-... · Em trânsito". */
const kicker = (status: string) =>
  `<p style="margin:0 0 6px;font-size:12px;font-weight:800;color:#0284c7;text-transform:uppercase;letter-spacing:.5px;">Pedido {{pedido}} · ${status}</p>`;

/** Blocos dos e-mails de status (lib/email/status-blocks.ts). Cada um some quando não se aplica ao pedido. */
const STATUS_BLOCKS = `
      {{progresso}}
      {{mensagem}}
      {{bloco_rastreio}}
      {{bloco_acesso}}`;

const itemsLine = `<p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #e2e8f0;font-size:14px;color:#4b6675;"><strong>Itens do pedido:</strong><br>{{itens}}</p>`;

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
    description: "Enviado quando o rastreio é cadastrado ou quando o status muda para Enviado no painel. Leva a linha do tempo, o rastreio e um código de acesso novo.",
    subject: "Seu pedido {{pedido}} foi enviado 🚚",
    enabled: true,
    bodyHtml: wrap(`
      ${kicker("Enviado")}
      <h1 style="font-size:24px;margin:0 0 12px;">Seu AquaBlast está a caminho, {{primeiro_nome}}!</h1>
      <p style="margin:0;">Seu pedido foi postado e já está com a transportadora. Veja em que etapa ele está:</p>
      ${STATUS_BLOCKS}
      ${btn("{{link_rastreio}}", "Acompanhar meu pedido")}
      ${itemsLine}
    `),
  },
  in_transit: {
    name: "Em trânsito",
    description: "Enviado quando o status muda para Em trânsito no painel. Leva a linha do tempo, o rastreio e um código de acesso novo.",
    subject: "Seu pedido {{pedido}} está em trânsito 🚚",
    enabled: true,
    bodyHtml: wrap(`
      ${kicker("Em trânsito")}
      <h1 style="font-size:24px;margin:0 0 12px;">Seu pedido está em trânsito, {{primeiro_nome}}!</h1>
      <p style="margin:0;">O pedido está com a transportadora, seguindo para o seu endereço. Veja em que etapa ele está:</p>
      ${STATUS_BLOCKS}
      ${btn("{{link_rastreio}}", "Acompanhar meu pedido")}
      ${itemsLine}
    `),
  },
  out_for_delivery: {
    name: "Saiu para entrega",
    description: "Enviado quando o pedido sai para entrega (aviso da transportadora ou mudança de status no painel).",
    subject: "Chega hoje! Pedido {{pedido}} saiu para entrega 🎁",
    enabled: true,
    bodyHtml: wrap(`
      ${kicker("Saiu para entrega")}
      <h1 style="font-size:24px;margin:0 0 12px;">Prepare a criançada, {{primeiro_nome}}!</h1>
      <p style="margin:0;">O pedido saiu para entrega e já está com o entregador. Fique de olho na campainha.</p>
      ${STATUS_BLOCKS}
      ${btn("{{link_rastreio}}", "Ver status da entrega")}
      ${itemsLine}
    `),
  },
  delivered: {
    name: "Pedido entregue",
    description: "Enviado quando a entrega é confirmada (aviso da transportadora ou mudança de status no painel).",
    subject: "Entregue! Boa diversão com o AquaBlast 💦",
    enabled: true,
    bodyHtml: wrap(`
      ${kicker("Entregue")}
      <h1 style="font-size:24px;margin:0 0 12px;">Entregue, {{primeiro_nome}}! 🎉</h1>
      <p style="margin:0;">O pedido <strong>{{pedido}}</strong> foi entregue. Esperamos que a brincadeira seja inesquecível.</p>
      {{progresso}}
      {{mensagem}}
      ${itemsLine}
      <p style="font-size:14px;color:#4b6675;">Se algo não estiver certo com o produto ou com a entrega, responda este e-mail ou chame a gente no WhatsApp.</p>
    `),
  },
  exception: {
    name: "Ocorrência na entrega",
    description: "Enviado quando o status muda para Ocorrência no painel. Escreva o que aconteceu no campo Descrição: ele vai como recado no e-mail.",
    subject: "Atualização sobre a entrega do pedido {{pedido}}",
    enabled: true,
    bodyHtml: wrap(`
      ${kicker("Ocorrência na entrega")}
      <h1 style="font-size:24px;margin:0 0 12px;">{{primeiro_nome}}, temos uma atualização sobre a sua entrega</h1>
      <p style="margin:0;">Houve uma ocorrência com a entrega do pedido <strong>{{pedido}}</strong> e nossa equipe já está cuidando disso.</p>
      ${STATUS_BLOCKS}
      <p style="font-size:14px;color:#4b6675;">Se precisarmos de alguma informação sua, como um complemento de endereço, entraremos em contato. Se preferir, fale com a gente pelo WhatsApp {{whatsapp}}.</p>
      ${btn("{{link_rastreio}}", "Acompanhar meu pedido")}
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
  cart_abandoned_1: {
    name: "Carrinho abandonado 1 (lembrete)",
    description: "1º e-mail para quem começou a compra e não terminou. Tempo definido em Configurações → Checkout.",
    subject: "{{primeiro_nome}}, seu AquaBlast ficou esperando 💧",
    enabled: true,
    bodyHtml: wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Faltou pouco, {{primeiro_nome}}!</h1>
      <p>Você começou a compra do seu AquaBlast e parou antes de concluir. Guardamos o que você já preencheu.</p>
      <p><strong>{{itens}}</strong><br>Total: <strong>{{valor}}</strong></p>
      ${btn("{{link_carrinho}}", "Continuar minha compra")}
      <p style="font-size:14px;color:#4b6675;">O pagamento pode ser por Pix ou cartão. Se já finalizou a compra, ignore este e-mail.</p>
      <p style="font-size:12px;color:#4b6675;">Não quer receber lembretes desta compra? <a href="{{link_descadastro}}">Clique aqui</a>.</p>
    `),
  },
  cart_abandoned_2: {
    name: "Carrinho abandonado 2 (dúvidas)",
    description: "2º e-mail. Oferece ajuda pelo WhatsApp e pelo e-mail de suporte.",
    subject: "Ficou com alguma dúvida sobre o AquaBlast?",
    enabled: true,
    bodyHtml: wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Podemos ajudar, {{primeiro_nome}}?</h1>
      <p>Vimos que a sua compra não foi concluída. Se ficou alguma dúvida sobre o produto, o pagamento ou a entrega, fale com a gente:</p>
      <p><strong>WhatsApp:</strong> {{whatsapp}}<br><strong>E-mail:</strong> {{email_suporte}}</p>
      <p>Seu pedido continua salvo:</p>
      <p><strong>{{itens}}</strong><br>Total: <strong>{{valor}}</strong></p>
      ${btn("{{link_carrinho}}", "Voltar para a compra")}
      <p style="font-size:12px;color:#4b6675;">Não quer receber lembretes desta compra? <a href="{{link_descadastro}}">Clique aqui</a>.</p>
    `),
  },
  cart_abandoned_3: {
    name: "Carrinho abandonado 3 (último aviso)",
    description: "3º e último e-mail. Depois dele o carrinho não recebe mais lembretes.",
    subject: "Último lembrete: sua compra do AquaBlast",
    enabled: true,
    bodyHtml: wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Este é o nosso último lembrete</h1>
      <p>{{primeiro_nome}}, não vamos mais escrever sobre esta compra. Se ainda quiser o seu AquaBlast, o link abaixo leva direto para onde você parou.</p>
      <p><strong>{{itens}}</strong><br>Total: <strong>{{valor}}</strong></p>
      ${btn("{{link_carrinho}}", "Finalizar minha compra")}
      <p style="font-size:12px;color:#4b6675;">Não quer receber lembretes desta compra? <a href="{{link_descadastro}}">Clique aqui</a>.</p>
    `),
  },
  payment_refused: {
    name: "Pagamento recusado",
    description: "Enviado quando o cartão é recusado e o comprador não paga de outra forma.",
    subject: "Não conseguimos aprovar o pagamento do pedido {{pedido}}",
    enabled: true,
    bodyHtml: wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">O pagamento não foi aprovado</h1>
      <p>{{primeiro_nome}}, o pagamento do pedido <strong>{{pedido}}</strong> não foi aprovado pela operadora do cartão. Nenhum valor foi cobrado.</p>
      <p>Você pode tentar outro cartão ou pagar por Pix:</p>
      ${btn("{{link_pagamento}}", "Tentar de novo")}
      <p style="font-size:14px;color:#4b6675;">Dúvidas? Fale com a gente: {{whatsapp}} ou {{email_suporte}}.</p>
    `),
  },
  pix_expired: {
    name: "Pix expirado",
    description: "Enviado quando o código Pix venceu sem pagamento. O link gera um código novo.",
    subject: "Seu código Pix do pedido {{pedido}} venceu",
    enabled: true,
    bodyHtml: wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Seu código Pix venceu</h1>
      <p>{{primeiro_nome}}, o código Pix do pedido <strong>{{pedido}}</strong> venceu antes do pagamento. É só gerar um novo:</p>
      ${btn("{{link_pagamento}}", "Gerar novo código Pix")}
      <p style="font-size:14px;color:#4b6675;">Se você já pagou, ignore este e-mail: a confirmação chega em instantes.</p>
    `),
  },
  admin_sla_atrasado: {
    name: "Alerta interno: pedido passou do prazo de postagem",
    description:
      "Vai para o e-mail de alertas (Configurações → Envios), não para o cliente. Um e-mail por pedido, enviado pelo cron /api/cron/reminders quando o pedido pago continua sem rastreio depois do prazo.",
    subject: "[{{loja}}] Pedido {{pedido}} passou do prazo de postagem ({{dias_atraso}} dia(s) de atraso)",
    enabled: true,
    bodyHtml: wrapInternal(`
      <h1 style="font-size:22px;margin:0 0 12px;">Pedido {{pedido}} ainda não foi postado</h1>
      <p>O prazo de postagem é de <strong>{{prazo_dias}} dia(s)</strong> após o pagamento e este pedido continua sem código de rastreio.</p>
      <p><strong>Cliente:</strong> {{cliente}}<br><strong>Pago em:</strong> {{pago_em}}<br><strong>Atraso:</strong> {{dias_atraso}} dia(s)<br><strong>Itens:</strong><br>{{itens}}</p>
      ${btn("{{link_admin}}", "Abrir o pedido no painel")}
      <p style="font-size:14px;color:#4b6675;">Este alerta vai uma única vez por pedido. Cadastre o rastreio em Envios para o pedido sair da lista de pendentes.</p>
    `),
  },
};

/** Corpo padrão do "Pedido enviado" antes do link da transportadora (2026-09-30), para atualizar linhas não editadas. */
const SHIPPED_BODY_V1 = wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Seu AquaBlast está a caminho, {{primeiro_nome}}!</h1>
      <p>O pedido <strong>{{pedido}}</strong> foi entregue à transportadora <strong>{{transportadora}}</strong>.</p>
      <p><strong>Código de rastreio:</strong> {{codigo_transportadora}}</p>
      <p>Acompanhe a entrega em tempo real com o seu código de acesso:</p>
      ${code("{{codigo_acesso}}")}
      ${btn("{{link_rastreio}}", "Acompanhar entrega")}
    `);

/** Corpo padrão do "Pedido enviado" de 2026-09-30 a 2026-10-02 (antes da linha do tempo). */
const SHIPPED_BODY_V2 = wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Seu AquaBlast está a caminho, {{primeiro_nome}}!</h1>
      <p>O pedido <strong>{{pedido}}</strong> foi entregue à transportadora <strong>{{transportadora}}</strong>.</p>
      <p><strong>Código de rastreio:</strong> {{codigo_transportadora}}</p>
      <p>Acompanhe a entrega em tempo real com o seu código de acesso:</p>
      ${code("{{codigo_acesso}}")}
      ${btn("{{link_rastreio}}", "Acompanhar entrega")}
      ${carrierLink("{{link_transportadora}}")}
    `);

/** Corpos padrão de "Saiu para entrega" e "Pedido entregue" até 2026-10-02. */
const OUT_FOR_DELIVERY_BODY_V1 = wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Prepare a criançada, {{primeiro_nome}}!</h1>
      <p>O entregador já está com o pedido <strong>{{pedido}}</strong>. Fique de olho na campainha.</p>
      ${btn("{{link_rastreio}}", "Ver status da entrega")}
    `);
const DELIVERED_BODY_V1 = wrap(`
      <h1 style="font-size:24px;margin:0 0 12px;">Entregue, {{primeiro_nome}}! 🎉</h1>
      <p>O pedido <strong>{{pedido}}</strong> foi entregue. Esperamos que a brincadeira seja inesquecível.</p>
      <p>Qualquer dúvida sobre o produto, fale com a gente pelo WhatsApp. Estamos por aqui!</p>
    `);

/**
 * Corpos padrão antigos por template. Quando o padrão muda, a linha do banco que ainda está com um corpo antigo
 * (ninguém editou) recebe o novo; se o dono editou o template, a versão dele fica intacta.
 */
const LEGACY_BODIES: Partial<Record<TemplateKey, string[]>> = {
  shipped: [SHIPPED_BODY_V1, SHIPPED_BODY_V2],
  out_for_delivery: [OUT_FOR_DELIVERY_BODY_V1],
  delivered: [DELIVERED_BODY_V1],
};

export async function ensureDefaultTemplates(): Promise<void> {
  for (const [key, t] of Object.entries(DEFAULT_TEMPLATES)) {
    await db
      .insert(emailTemplates)
      .values({ key, name: t.name, description: t.description, subject: t.subject, bodyHtml: t.bodyHtml, enabled: t.enabled })
      .onConflictDoNothing();
  }
  for (const [key, olds] of Object.entries(LEGACY_BODIES)) {
    const t = DEFAULT_TEMPLATES[key as TemplateKey];
    await db
      .update(emailTemplates)
      .set({ bodyHtml: t.bodyHtml, description: t.description, updatedAt: new Date() })
      .where(and(eq(emailTemplates.key, key), inArray(emailTemplates.bodyHtml, olds)));
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
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, "\n")
    .replace(/<\/td>/gi, "  ")
    .replace(/&#10003;/g, "✓")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/^[ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
