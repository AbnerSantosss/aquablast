// Variáveis da moldura dos e-mails ao cliente (cabeçalho e rodapé): {{loja}}, {{frase}}, {{contato}},
// {{whatsapp}} e {{email_suporte}}. Um lugar só, usado pelos e-mails de pedido, de carrinho e pela pré-visualização.
import { toSupportWhatsapp } from "@/lib/site/support-contact";
import { escapeHtml } from "./templates";

/** Fim do Dia das Crianças de 2026 (12/10, horário de Brasília). Depois disso a frase da campanha sai sozinha. */
const CAMPAIGN_END = new Date("2026-10-13T00:00:00-03:00");
const CAMPAIGN_TAGLINE = "Diversão garantida neste Dia das Crianças 💦";
/** Lema da marca, o mesmo do topo do site. */
const BRAND_TAGLINE = "Diversão que aproxima";

export function emailTagline(now: Date = new Date()): string {
  return now < CAMPAIGN_END ? CAMPAIGN_TAGLINE : BRAND_TAGLINE;
}

const LINK = "color:#0b6fa4;font-weight:700;text-decoration:none;";

/**
 * `whatsapp` só sai quando o número do painel é válido: número incompleto vira link que não abre conversa,
 * então é melhor o e-mail oferecer só o contato por e-mail.
 */
export function brandVars(store: { name: string; whatsapp: string; email: string }, now: Date = new Date()): Record<string, string> {
  const wa = toSupportWhatsapp(String(store.whatsapp ?? ""));
  const email = store.email.trim();
  const parts: string[] = [];
  if (wa) parts.push(`pelo WhatsApp <a href="${wa.href}" style="${LINK}">${escapeHtml(wa.label)}</a>`);
  if (email) parts.push(`pelo e-mail <a href="mailto:${escapeHtml(email)}" style="${LINK}">${escapeHtml(email)}</a>`);
  return {
    loja: escapeHtml(store.name),
    frase: emailTagline(now),
    whatsapp: wa ? wa.digits : "",
    email_suporte: escapeHtml(email),
    contato: parts.length ? parts.join(" ou ") : "respondendo este e-mail",
  };
}
