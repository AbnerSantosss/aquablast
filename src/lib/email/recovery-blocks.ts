// SÓ SERVIDOR. Blocos de HTML dos e-mails de recuperação (carrinho abandonado, Pix vencido, cartão recusado):
// cartão do produto com foto, botão de WhatsApp, vantagens e caixa de oferta. Funções puras, sem banco.
// Mesma técnica visual de templates.ts: tudo em tabela com role="presentation", estilo inline, bgcolor além de
// background, mso-padding-alt no botão (Outlook desktop), imagem com width/height em atributo e sem <div> com tamanho.
// Cores: só as que já existem nos e-mails (#063760, #f97316, #22d3ee, #12303f, #55707e, #dbe7ee, #eef4f8, #f6fafc,
// #f3f8fb, #0b6fa4, #bfe3f5, #7b919d, #ffffff). Todo texto que veio do cliente passa por escapeHtml.
import { selectionFromCart, selectionFromParams, titleOf, variantOf, type Selection } from "@/lib/checkout/own/catalog";
import { money } from "@/lib/checkout/own/masks";
import { FREE_SHIPPING_LABEL } from "@/lib/checkout/own/shipping";
import { buildSitePrices, type PriceCents } from "@/lib/site/prices";
import { toSupportWhatsapp } from "@/lib/site/support-contact";
import { EMAIL_FONT, escapeHtml } from "./templates";

const FONT = EMAIL_FONT;
const INK = "#12303f";
const MUTED = "#55707e";
const LINE = "#dbe7ee";
const NAVY = "#063760";
const ORANGE = "#f97316";

/** Link de conversa do WhatsApp com mensagem pronta. "" quando não há número. */
export function whatsappLink(digits: string, text: string): string {
  const d = digits.trim();
  if (!/^\d{10,15}$/.test(d)) return "";
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

/** Só os dígitos do WhatsApp do painel, e só se o número é válido (mesmo critério do rodapé dos e-mails). */
export function supportDigits(raw: string): string {
  return toSupportWhatsapp(String(raw ?? ""))?.digits ?? "";
}

/** Mensagem pronta da conversa. Sem nome, a frase continua natural. */
export function whatsappCartMessage(firstName: string): string {
  const name = firstName.trim().slice(0, 40);
  return name ? `Oi! Sou ${name} e tenho uma dúvida sobre a minha compra do AquaBlast.` : "Oi! Tenho uma dúvida sobre a minha compra do AquaBlast.";
}

/**
 * Cartão do produto: foto à esquerda, título, variante e total à direita. A célula da foto tem bgcolor para o
 * quadro não ficar "furado" quando o cliente de e-mail bloqueia imagens (o `alt` aparece no lugar).
 * `imageUrl` já absoluta; `total` já formatado (ex.: "R$ 149,71 no Pix").
 */
export function productCardHtml(p: { imageUrl: string; alt: string; title: string; variant: string; total: string }): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f8fb" style="margin:18px 0;background:#f3f8fb;border:1px solid ${LINE};border-radius:12px;border-collapse:separate;">
        <tr>
          <td width="140" valign="middle" align="center" bgcolor="#ffffff" style="width:140px;padding:12px;background:#ffffff;border-radius:12px 0 0 12px;">
            <img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.alt)}" width="116" height="116" border="0" style="display:block;width:116px;max-width:100%;height:auto;border:0;font-family:${FONT};font-size:12px;line-height:1.3;color:${INK};">
          </td>
          <td valign="middle" align="left" style="padding:12px 16px 12px 8px;font-family:${FONT};color:${INK};">
            <div style="font-size:12px;line-height:1.4;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.5px;">Seu pedido</div>
            <div style="margin-top:4px;font-size:16px;line-height:1.35;font-weight:800;color:${NAVY};">${escapeHtml(p.title)}</div>
            <div style="margin-top:2px;font-size:14px;line-height:1.45;color:${MUTED};">${escapeHtml(p.variant)}</div>
            <div style="margin-top:8px;font-size:18px;line-height:1.3;font-weight:800;color:${INK};">${escapeHtml(p.total)}</div>
          </td>
        </tr>
      </table>`;
}

/**
 * Botão secundário (azul-marinho) do WhatsApp. Mesma técnica do botão laranja de templates.ts (tabela com bgcolor,
 * mso-padding-alt). A célula de fora devolve o respiro que o Outlook tira da margem da tabela. "" sem `href`.
 */
export function whatsappButtonHtml(href: string, label: string): string {
  if (!href) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="left" style="padding:4px 0 20px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${NAVY}" style="background:${NAVY};border-radius:10px;mso-padding-alt:14px 30px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:16px;line-height:1.2;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a></td></tr></table></td></tr></table>`;
}

/** Faixa de vantagens: uma por linha (empilha igual no celular e no desktop), cada uma com ✓. "" sem vantagens. */
export function perksHtml(perks: string[]): string {
  const items = perks.map((x) => x.trim()).filter(Boolean);
  if (items.length === 0) return "";
  const rows = items
    .map(
      (t) =>
        `<tr><td width="24" valign="top" style="width:24px;padding:3px 0;font-family:${FONT};font-size:15px;line-height:1.5;font-weight:800;color:#0b6fa4;">&#10003;</td><td valign="top" style="padding:3px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${INK};">${escapeHtml(t)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6fafc" style="margin:18px 0;background:#f6fafc;border:1px solid ${LINE};border-radius:12px;border-collapse:separate;"><tr><td style="padding:12px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
}

/** Texto do cliente ou do painel com **negrito** simples: escapa tudo e só depois troca os pares de ** por <strong>. */
function boldMarks(s: string): string {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/** Caixa de oferta: borda tracejada laranja de 2 px, fundo claro. "" sem título e sem linhas. */
export function offerHtml(o: { heading: string; lines: string[]; note?: string }): string {
  const lines = o.lines.map((x) => x.trim()).filter(Boolean);
  if (!o.heading.trim() && lines.length === 0) return "";
  const heading = o.heading.trim()
    ? `<tr><td style="padding:0 0 6px;font-family:${FONT};font-size:17px;line-height:1.35;font-weight:800;color:${NAVY};">${escapeHtml(o.heading.trim())}</td></tr>`
    : "";
  const body = lines.map((l) => `<tr><td style="padding:3px 0;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK};">${boldMarks(l)}</td></tr>`).join("");
  const note = o.note?.trim() ? `<tr><td style="padding:8px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(o.note.trim())}</td></tr>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f8fb" style="margin:18px 0;background:#f3f8fb;border:2px dashed ${ORANGE};border-radius:12px;border-collapse:separate;"><tr><td style="padding:16px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${heading}${body}${note}</table></td></tr></table>`;
}

/**
 * Seleção "de verdade" do carrinho: unidade com a oferta da segunda unidade aceita e as duas cores escolhidas vale
 * kit (é o que o checkout cobra, ver `cartColorsOf` em checkout/own/cart.ts). Carrinho multiempresa (`pack = "items"`)
 * não tem produto do catálogo do AquaBlast: devolve null e os blocos de produto, vantagens e oferta saem vazios.
 */
export function effectiveSelection(cart: { pack: string; colors: string[]; bumpAccepted: boolean }): Selection | null {
  if (cart.pack === "items") return null;
  const sel = selectionFromCart(cart);
  if (sel.pack === "unit" && cart.bumpAccepted && cart.colors.length === 2) {
    return selectionFromParams({ pack: "kit", cor1: cart.colors[0], cor2: cart.colors[1] });
  }
  return sel;
}

export interface RecoveryInput {
  /** APP_URL sem barra no fim. */
  baseUrl: string;
  /** Chave do modelo (cart_abandoned_2...): vai no utm_campaign do link de dúvidas. */
  campaign: string;
  /** null = carrinho sem produto do catálogo (multiempresa): sem cartão, vantagens nem oferta. */
  selection: Selection | null;
  firstName: string;
  /** Total do carrinho no Pix, em centavos (`amountCents`). */
  totalCents: number;
  /** `checkout.prices`, `checkout.maxInstallments` e `checkout.bumpEnabled` do painel. */
  prices: PriceCents;
  maxInstallments: number;
  bumpEnabled: boolean;
  /** Frete grátis escolhido (padrão). Com Frete FULL a vantagem de frete grátis não se aplica. */
  freeShipping: boolean;
  /** Valor cru de `store.supportWhatsapp`: só vira link se for número válido. */
  whatsappRaw: string;
}

/** Vantagens reais, calculadas na hora com os valores do painel. Nada de prazo, garantia ou avaliação. */
function perksOf(i: RecoveryInput, sel: Selection): string[] {
  const sp = buildSitePrices(i.prices, i.maxInstallments);
  const perks: string[] = [];
  if (i.freeShipping) perks.push(`${FREE_SHIPPING_LABEL} no seu pedido`);
  const discount = sp[sel.pack].pixDiscount;
  if (discount) perks.push(`${discount} de desconto pagando no Pix`);
  if (sp.installments > 1) perks.push(`Até ${sp.installments}x sem juros no cartão`);
  return perks;
}

/** Oferta do carrinho: segunda unidade (carrinho de 1 unidade) ou economia do kit, mais o desconto do Pix. */
function offerOf(i: RecoveryInput, sel: Selection): string {
  const sp = buildSitePrices(i.prices, i.maxInstallments);
  const lines: string[] = [];
  let note: string | undefined;
  let heading = "";
  if (sel.pack === "unit") {
    if (i.bumpEnabled && sp.kitSaving) {
      heading = "Leve a segunda unidade";
      lines.push(`As duas saem por **${sp.kit.pix}** no Pix, uma economia de **${sp.kitSaving}** em relação a duas unidades avulsas.`);
      note = "É só marcar a oferta da segunda unidade na etapa de pagamento.";
    }
  } else if (sp.kitSaving) {
    heading = "Você já garantiu o kit com 2";
    lines.push(`Economia de **${sp.kitSaving}** no Pix em relação a duas unidades avulsas.`);
  }
  const discount = sp[sel.pack].pixDiscount;
  if (discount) {
    if (!heading) heading = "Condição do Pix";
    lines.push(`Pagando no Pix, você tem **${discount}** de desconto em relação ao cartão.`);
  }
  if (lines.length === 0) return "";
  return offerHtml({ heading, lines, note });
}

/**
 * As variáveis novas dos e-mails de recuperação. Uma função só para o envio real (abandoned.ts) e a prévia do
 * painel (sample-vars.ts) mostrarem a mesma coisa. Valores prontos para entrar no HTML (já escapados).
 */
export function recoveryVars(i: RecoveryInput): Record<string, string> {
  const sel = i.selection;
  const digits = supportDigits(i.whatsappRaw);
  const href = whatsappLink(digits, whatsappCartMessage(i.firstName));
  const card = sel
    ? productCardHtml({
        imageUrl: `${i.baseUrl}/email/${sel.pack === "kit" ? "kit" : `produto-${sel.colors[0]}`}.jpg`,
        alt: sel.pack === "kit" ? "Kit com 2 AquaBlast" : `AquaBlast ${variantOf(sel).toLowerCase()}`,
        title: titleOf(sel),
        variant: variantOf(sel),
        total: `${money(i.totalCents)} no Pix`,
      })
    : "";
  return {
    bloco_produto: card,
    botao_whatsapp: whatsappButtonHtml(href, "Tirar dúvida no WhatsApp"),
    link_whatsapp: href,
    bloco_vantagens: sel ? perksHtml(perksOf(i, sel)) : "",
    bloco_oferta: sel ? offerOf(i, sel) : "",
    link_duvidas: `${i.baseUrl}/?utm_source=email&utm_medium=recuperacao&utm_campaign=${encodeURIComponent(i.campaign)}#duvidas`,
  };
}

/** Botão e link de WhatsApp dos e-mails de pedido (Pix lembrete/vencido, pagamento recusado). */
export function orderWhatsappVars(whatsappRaw: string, orderNumber: string): Record<string, string> {
  const href = whatsappLink(supportDigits(whatsappRaw), `Oi! Tenho uma dúvida sobre o pedido ${orderNumber} do AquaBlast.`);
  return { botao_whatsapp: whatsappButtonHtml(href, "Tirar dúvida no WhatsApp"), link_whatsapp: href };
}
