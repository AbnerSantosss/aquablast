import { and, eq, inArray, ne, sql } from "drizzle-orm";
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
  "{{contato}}",
  "{{frase}}",
] as const;

// ---------- Visual dos e-mails (refeito em 2026-10-02, pedido do dono: "mais bonito e mais profissional") ----------
// Tudo em tabela e estilo inline: é o que Gmail, Outlook e os apps de celular respeitam. Sem imagem (muitos
// clientes bloqueiam imagem por padrão), sem fonte externa. Cores: azul-marinho do site (#063760) no cabeçalho,
// laranja (#f97316) só no botão principal.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#12303f";
const MUTED = "#55707e";
const LINE = "#dbe7ee";

/**
 * Moldura dos e-mails ao cliente. `preheader` é o resumo que aparece na caixa de entrada ao lado do assunto.
 * {{frase}} e {{contato}} vêm de lib/email/brand-vars.ts: a frase da campanha troca sozinha depois de 12/10 e
 * o contato só mostra WhatsApp quando o número do painel é válido.
 */
const wrap = (preheader: string, inner: string) => `
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#eef4f8;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef4f8" style="background:#eef4f8;margin:0;"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${FONT};color:${INK};">
    <tr><td bgcolor="#063760" style="background:#063760;border-radius:16px 16px 0 0;padding:26px 32px 22px;">
      <div style="font-size:24px;line-height:1.2;font-weight:800;color:#ffffff;">{{loja}}</div>
      <div style="font-size:13px;line-height:1.4;color:#bfe3f5;margin-top:4px;">{{frase}}</div>
    </td></tr>
    <tr><td bgcolor="#22d3ee" style="background:#22d3ee;height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
    <tr><td bgcolor="#ffffff" style="background:#ffffff;border-left:1px solid ${LINE};border-right:1px solid ${LINE};padding:32px 32px 28px;font-size:16px;line-height:1.6;color:${INK};">
      ${inner}
    </td></tr>
    <tr><td bgcolor="#f6fafc" style="background:#f6fafc;border:1px solid ${LINE};border-radius:0 0 16px 16px;padding:20px 32px;font-size:14px;line-height:1.6;color:${MUTED};">
      <strong style="color:${INK};">Precisa de ajuda?</strong><br>Fale com a gente {{contato}}.
    </td></tr>
    <tr><td align="center" style="padding:18px 16px 0;font-size:12px;line-height:1.5;color:#7b919d;">
      Você recebeu este e-mail porque fez ou iniciou um pedido na {{loja}}.
    </td></tr>
  </table>
</td></tr></table>`;

const h1 = (text: string) => `<h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;font-weight:800;color:#063760;">${text}</h1>`;

const p = (text: string) => `<p style="margin:0 0 14px;">${text}</p>`;

const small = (text: string) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.55;color:${MUTED};">${text}</p>`;

/** Botão principal. Em tabela com bgcolor para o Outlook não desenhar um link solto. */
const btn = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td align="center" bgcolor="#f97316" style="background:#f97316;border-radius:10px;"><a href="${href}" style="display:inline-block;padding:14px 30px;font-size:16px;line-height:1.2;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a></td></tr></table>`;

/** Moldura dos e-mails internos (para a equipe): sem a frase da campanha nem o rodapé de suporte ao cliente. */
const wrapInternal = (inner: string) => `
<div style="margin:0;padding:24px 12px;background:#eaf6fb;font-family:Arial,Helvetica,sans-serif;color:#0f2c3a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;padding:24px 28px;font-size:15px;line-height:1.55;">
    <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#4b6675;">Painel {{loja}} · aviso interno</p>
    ${inner}
  </div>
</div>`;

/** Botão do e-mail interno (visual antigo, mantido para o modelo interno não mudar). */
const btnInternal = (href: string, label: string) =>
  `<p style="margin:22px 0;"><a href="${href}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:900;padding:14px 26px;border-radius:999px;font-size:16px;">${label}</a></p>`;

/** Caixa com um código para copiar (código de rastreio, Pix copia e cola). */
const code = (label: string, v: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;border-collapse:separate;"><tr><td style="padding:14px 16px;background:#f3f8fb;border:1px solid ${LINE};border-radius:10px;">
        <div style="font-size:12px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.5px;">${label}</div>
        <div style="margin-top:6px;font-family:Consolas,'Courier New',monospace;font-size:15px;line-height:1.45;font-weight:700;color:${INK};word-break:break-all;">${v}</div>
      </td></tr></table>`;

/** Selo acima do título dos e-mails de status: "Pedido AQB-... · Em trânsito". */
const kicker = (status: string) =>
  `<p style="margin:0 0 10px;font-size:12px;line-height:1.4;font-weight:700;color:#0b6fa4;text-transform:uppercase;letter-spacing:.6px;">Pedido {{pedido}} · ${status}</p>`;

/**
 * Blocos dos e-mails de status (lib/email/status-blocks.ts). Cada um some quando não se aplica ao pedido.
 * Sem bloco da transportadora: o cliente acompanha pelo nosso site, com o código de rastreio.
 */
const STATUS_BLOCKS = `
      {{progresso}}
      {{mensagem}}
      {{bloco_acesso}}`;

/** Resumo do pedido: itens e, quando faz sentido, o total. */
const summary = (withTotal: boolean) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 6px;border-top:1px solid ${LINE};">
        <tr><td style="padding:14px 0 0;font-size:12px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.5px;">Itens do pedido</td></tr>
        <tr><td style="padding:4px 0 0;font-size:15px;line-height:1.5;color:${INK};">{{itens}}</td></tr>${
          withTotal
            ? `
        <tr><td style="padding:12px 0 0;font-size:12px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.5px;">Total</td></tr>
        <tr><td style="padding:2px 0 0;font-size:18px;font-weight:800;color:${INK};">{{valor}}</td></tr>`
            : ""
        }
      </table>`;

const unsubscribe = `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#7b919d;">Não quer receber lembretes desta compra? <a href="{{link_descadastro}}" style="color:#7b919d;">Clique aqui</a>.</p>`;

export const DEFAULT_TEMPLATES: Record<TemplateKey, { name: string; description: string; subject: string; bodyHtml: string; enabled: boolean }> = {
  order_confirmed: {
    name: "Pagamento confirmado",
    description: "Enviado automaticamente quando o checkout confirma o pagamento. Leva o código de rastreio do pedido.",
    subject: "Pedido {{pedido}} confirmado! Seu AquaBlast já está a caminho 💦",
    enabled: true,
    bodyHtml: wrap(
      "Pagamento confirmado. Guarde seu código de rastreio para acompanhar a entrega.",
      `
      ${kicker("Pagamento confirmado")}
      ${h1("Oba, {{primeiro_nome}}! Pagamento confirmado 🎉")}
      ${p("Recebemos o pagamento do pedido <strong>{{pedido}}</strong>. Agora é com a gente: vamos separar e embalar seu AquaBlast com todo cuidado.")}
      ${p("Para acompanhar cada etapa da entrega, use o seu código de rastreio:")}
      ${code("Seu código de rastreio", "{{codigo_acesso}}")}
      ${btn("{{link_rastreio}}", "Acompanhar meu pedido")}
      ${small("Guarde este e-mail: o código é pessoal e serve para acompanhar o pedido até a entrega.")}
      ${summary(true)}
    `,
    ),
  },
  pix_pending: {
    name: "Pix gerado (aguardando pagamento)",
    description: "Enviado quando o checkout cria um pedido com Pix pendente. Contém o código copia-e-cola.",
    subject: "Seu Pix do pedido {{pedido}} está pronto para pagar",
    enabled: true,
    bodyHtml: wrap(
      "Seu pedido está reservado. Pague o Pix para garantir.",
      `
      ${h1("Falta só um passo, {{primeiro_nome}}!")}
      ${p("Seu pedido <strong>{{pedido}}</strong> foi reservado. Para garantir o AquaBlast, pague o Pix abaixo (copia e cola):")}
      ${code("Pix copia e cola", "{{pix_copia_cola}}")}
      ${btn("{{link_pagamento}}", "Abrir página de pagamento")}
      ${small("Assim que o pagamento for confirmado, você recebe outro e-mail com o código para acompanhar a entrega.")}
    `,
    ),
  },
  pix_reminder: {
    name: "Lembrete de Pix (remarketing)",
    description: "Reenvio do Pix para quem não pagou. Pode ser automático (Configurações → Lembrete de Pix) ou manual no pedido.",
    subject: "{{primeiro_nome}}, seu AquaBlast ainda está reservado 💧",
    enabled: true,
    bodyHtml: wrap(
      "O pagamento do seu pedido ainda não foi concluído.",
      `
      ${h1("Ainda dá tempo, {{primeiro_nome}}!")}
      ${p("Notamos que o pagamento do pedido <strong>{{pedido}}</strong> ainda não foi concluído. Seu AquaBlast continua reservado: é só concluir o pagamento.")}
      ${p("Pague com o Pix copia e cola:")}
      ${code("Pix copia e cola", "{{pix_copia_cola}}")}
      ${btn("{{link_pagamento}}", "Finalizar meu pedido")}
      ${small("Se você já pagou, ignore este e-mail: a confirmação chega em instantes.")}
    `,
    ),
  },
  shipped: {
    name: "Pedido enviado",
    description: "Enviado quando o rastreio é cadastrado ou quando o status muda para Enviado no painel. Leva a linha do tempo e o código de rastreio do pedido.",
    subject: "Seu pedido {{pedido}} foi enviado 🚚",
    enabled: true,
    bodyHtml: wrap(
      "Seu pedido foi enviado. Veja como acompanhar a entrega.",
      `
      ${kicker("Enviado")}
      ${h1("Seu AquaBlast está a caminho, {{primeiro_nome}}!")}
      ${p("Seu pedido foi postado e já está com a transportadora. Veja em que etapa ele está:")}
      ${STATUS_BLOCKS}
      ${btn("{{link_rastreio}}", "Acompanhar meu pedido")}
      ${summary(false)}
    `,
    ),
  },
  in_transit: {
    name: "Em trânsito",
    description: "Enviado quando o status muda para Em trânsito no painel. Leva a linha do tempo e o código de rastreio do pedido.",
    subject: "Seu pedido {{pedido}} está em trânsito 🚚",
    enabled: true,
    bodyHtml: wrap(
      "Seu pedido está a caminho do seu endereço.",
      `
      ${kicker("Em trânsito")}
      ${h1("Seu pedido está em trânsito, {{primeiro_nome}}!")}
      ${p("O pedido está com a transportadora, seguindo para o seu endereço. Veja em que etapa ele está:")}
      ${STATUS_BLOCKS}
      ${btn("{{link_rastreio}}", "Acompanhar meu pedido")}
      ${summary(false)}
    `,
    ),
  },
  out_for_delivery: {
    name: "Saiu para entrega",
    description: "Enviado quando o pedido sai para entrega (aviso da transportadora ou mudança de status no painel).",
    subject: "Chega hoje! Pedido {{pedido}} saiu para entrega 🎁",
    enabled: true,
    bodyHtml: wrap(
      "Seu pedido saiu para entrega.",
      `
      ${kicker("Saiu para entrega")}
      ${h1("Prepare a criançada, {{primeiro_nome}}!")}
      ${p("O pedido saiu para entrega e já está com o entregador. Fique de olho na campainha.")}
      ${STATUS_BLOCKS}
      ${btn("{{link_rastreio}}", "Ver status da entrega")}
      ${summary(false)}
    `,
    ),
  },
  delivered: {
    name: "Pedido entregue",
    description: "Enviado quando a entrega é confirmada (aviso da transportadora ou mudança de status no painel).",
    subject: "Entregue! Boa diversão com o AquaBlast 💦",
    enabled: true,
    bodyHtml: wrap(
      "Seu pedido foi entregue. Boa diversão!",
      `
      ${kicker("Entregue")}
      ${h1("Entregue, {{primeiro_nome}}! 🎉")}
      ${p("O pedido <strong>{{pedido}}</strong> foi entregue. Esperamos que a brincadeira seja inesquecível.")}
      {{progresso}}
      {{mensagem}}
      ${summary(false)}
      ${small("Se algo não estiver certo com o produto ou com a entrega, fale com a gente {{contato}}.")}
    `,
    ),
  },
  exception: {
    name: "Ocorrência na entrega",
    description: "Enviado quando o status muda para Ocorrência no painel. Escreva o que aconteceu no campo Descrição: ele vai como recado no e-mail.",
    subject: "Atualização sobre a entrega do pedido {{pedido}}",
    enabled: true,
    bodyHtml: wrap(
      "Temos uma atualização sobre a entrega do seu pedido.",
      `
      ${kicker("Ocorrência na entrega")}
      ${h1("{{primeiro_nome}}, temos uma atualização sobre a sua entrega")}
      ${p("Houve uma ocorrência com a entrega do pedido <strong>{{pedido}}</strong> e nossa equipe já está cuidando disso.")}
      ${STATUS_BLOCKS}
      ${small("Se precisarmos de alguma informação sua, como um complemento de endereço, entraremos em contato. Se preferir, fale com a gente {{contato}}.")}
      ${btn("{{link_rastreio}}", "Acompanhar meu pedido")}
    `,
    ),
  },
  access_code: {
    name: "Reenvio do código de rastreio",
    description: "Disparado manualmente no painel quando o cliente perdeu o código. Gera um código novo; o anterior deixa de valer.",
    subject: "Seu código de rastreio do pedido {{pedido}}",
    enabled: true,
    bodyHtml: wrap(
      "Seu novo código para acompanhar o pedido.",
      `
      ${h1("Aqui está seu código, {{primeiro_nome}}")}
      ${p("Use o código abaixo para acompanhar o pedido <strong>{{pedido}}</strong>:")}
      ${code("Seu código de rastreio", "{{codigo_acesso}}")}
      ${btn("{{link_rastreio}}", "Acompanhar meu pedido")}
      ${small("O código anterior deixou de valer.")}
    `,
    ),
  },
  cart_abandoned_1: {
    name: "Carrinho abandonado 1 (lembrete)",
    description: "1º e-mail para quem começou a compra e não terminou. Tempo definido em Configurações → Checkout.",
    subject: "{{primeiro_nome}}, seu AquaBlast ficou esperando 💧",
    enabled: true,
    bodyHtml: wrap(
      "Guardamos o que você já preencheu. É só continuar.",
      `
      ${h1("Faltou pouco, {{primeiro_nome}}!")}
      ${p("Você começou a compra do seu AquaBlast e parou antes de concluir. Guardamos o que você já preencheu.")}
      ${summary(true)}
      ${btn("{{link_carrinho}}", "Continuar minha compra")}
      ${small("O pagamento pode ser por Pix ou cartão. Se já finalizou a compra, ignore este e-mail.")}
      ${unsubscribe}
    `,
    ),
  },
  cart_abandoned_2: {
    name: "Carrinho abandonado 2 (dúvidas)",
    description: "2º e-mail. Oferece ajuda pelo WhatsApp e pelo e-mail de suporte.",
    subject: "Ficou com alguma dúvida sobre o AquaBlast?",
    enabled: true,
    bodyHtml: wrap(
      "Ficou alguma dúvida? Estamos por aqui.",
      `
      ${h1("Podemos ajudar, {{primeiro_nome}}?")}
      ${p("Vimos que a sua compra não foi concluída. Se ficou alguma dúvida sobre o produto, o pagamento ou a entrega, fale com a gente {{contato}}.")}
      ${p("Seu pedido continua salvo:")}
      ${summary(true)}
      ${btn("{{link_carrinho}}", "Voltar para a compra")}
      ${unsubscribe}
    `,
    ),
  },
  cart_abandoned_3: {
    name: "Carrinho abandonado 3 (último aviso)",
    description: "3º e último e-mail. Depois dele o carrinho não recebe mais lembretes.",
    subject: "Último lembrete: sua compra do AquaBlast",
    enabled: true,
    bodyHtml: wrap(
      "Este é o nosso último lembrete sobre esta compra.",
      `
      ${h1("Este é o nosso último lembrete")}
      ${p("{{primeiro_nome}}, não vamos mais escrever sobre esta compra. Se ainda quiser o seu AquaBlast, o link abaixo leva direto para onde você parou.")}
      ${summary(true)}
      ${btn("{{link_carrinho}}", "Finalizar minha compra")}
      ${unsubscribe}
    `,
    ),
  },
  payment_refused: {
    name: "Pagamento recusado",
    description: "Enviado quando o cartão é recusado e o comprador não paga de outra forma.",
    subject: "Não conseguimos aprovar o pagamento do pedido {{pedido}}",
    enabled: true,
    bodyHtml: wrap(
      "O pagamento não foi aprovado. Você pode tentar de novo.",
      `
      ${h1("O pagamento não foi aprovado")}
      ${p("{{primeiro_nome}}, o pagamento do pedido <strong>{{pedido}}</strong> não foi aprovado pela operadora do cartão. Nenhum valor foi cobrado.")}
      ${p("Você pode tentar outro cartão ou pagar por Pix:")}
      ${btn("{{link_pagamento}}", "Tentar de novo")}
    `,
    ),
  },
  pix_expired: {
    name: "Pix expirado",
    description: "Enviado quando o código Pix venceu sem pagamento. O link gera um código novo.",
    subject: "Seu código Pix do pedido {{pedido}} venceu",
    enabled: true,
    bodyHtml: wrap(
      "O código Pix venceu. Gere um novo em um clique.",
      `
      ${h1("Seu código Pix venceu")}
      ${p("{{primeiro_nome}}, o código Pix do pedido <strong>{{pedido}}</strong> venceu antes do pagamento. É só gerar um novo:")}
      ${btn("{{link_pagamento}}", "Gerar novo código Pix")}
      ${small("Se você já pagou, ignore este e-mail: a confirmação chega em instantes.")}
    `,
    ),
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
      ${btnInternal("{{link_admin}}", "Abrir o pedido no painel")}
      <p style="font-size:14px;color:#4b6675;">Este alerta vai uma única vez por pedido. Cadastre o rastreio em Envios para o pedido sair da lista de pendentes.</p>
    `),
  },
};

/**
 * md5 dos corpos padrão anteriores de cada modelo (todas as versões até 2026-10-02). Quando o padrão muda, a
 * linha do banco que ainda está com um corpo antigo (ninguém editou) recebe o novo; se o dono editou o modelo,
 * a versão dele fica intacta. Guardar o md5 evita carregar no código o HTML inteiro de cada versão antiga.
 * Ao mudar um corpo padrão de novo: acrescente aqui o md5 do corpo que está saindo.
 */
const LEGACY_BODY_MD5: Partial<Record<TemplateKey, string[]>> = {
  order_confirmed: ["0bdd6d29c6eab3b05ec55eb753a2d985", "1848547bb8a53fd86698c8df88fb8d77"],
  pix_pending: ["4b3038f1e1b0c77854b8e45ec84d4f1f"],
  pix_reminder: ["bb9b27e596d69e4e63e46b58da07031f"],
  shipped: ["538372bfd8e203132534593482b76098", "5ce9ae83020a8d7875e01e171e5da126", "214bda98475a0979119fc6f1fcc3de1d"],
  in_transit: ["374c4dc3bea9f848922e92b729f03cd5"],
  out_for_delivery: ["3a31e54f307806e221b1f3459be072c0", "acad352622514414448ce0ea2969b39f"],
  delivered: ["8b24ebe04a08c4fb7cb1538a10caa2d5", "7144e3bc62e08e61bf4a137ee74199b7"],
  exception: ["5ef65eef2c5042e3e0571bd916de9a80"],
  access_code: ["0d21364bdd8a1f1964b162b36e67db86", "1127c08521c1c6666fe8ffa32086aedd"],
  cart_abandoned_1: ["470c33cec62a7012b9a9a164736a0c93"],
  cart_abandoned_2: ["b2b3f78c8e5ab5a90a626341bed39b93"],
  cart_abandoned_3: ["273e61e090d52f17d60e3d1f7957fcd3"],
  payment_refused: ["53b1ae53d3d6ec4be384f14f194f2f55"],
  pix_expired: ["48e11455f7a1baacc77acca51d43296d"],
};

export async function ensureDefaultTemplates(): Promise<void> {
  for (const [key, t] of Object.entries(DEFAULT_TEMPLATES)) {
    await db
      .insert(emailTemplates)
      .values({ key, name: t.name, description: t.description, subject: t.subject, bodyHtml: t.bodyHtml, enabled: t.enabled })
      .onConflictDoNothing();
  }
  for (const [key, hashes] of Object.entries(LEGACY_BODY_MD5)) {
    const t = DEFAULT_TEMPLATES[key as TemplateKey];
    await db
      .update(emailTemplates)
      // Corpo intocado = ninguém personalizou o modelo; nome e assunto padrão acompanham (o de access_code mudou em 2026-10-02).
      .set({ bodyHtml: t.bodyHtml, name: t.name, subject: t.subject, description: t.description, updatedAt: new Date() })
      .where(and(eq(emailTemplates.key, key), inArray(sql<string>`md5(${emailTemplates.bodyHtml})`, hashes)));
  }
  // A descrição é só texto interno do painel e não é editável lá (o salvar sempre regrava a padrão),
  // então acompanha o código mesmo quando o corpo foi personalizado. Sem mexer em updatedAt.
  for (const [key, t] of Object.entries(DEFAULT_TEMPLATES)) {
    await db
      .update(emailTemplates)
      .set({ description: t.description })
      .where(and(eq(emailTemplates.key, key), ne(emailTemplates.description, t.description)));
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
