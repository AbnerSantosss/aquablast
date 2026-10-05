// Variáveis da moldura dos e-mails ao cliente (cabeçalho e rodapé): {{loja}}, {{frase}}, {{contato}},
// {{whatsapp}} e {{email_suporte}}. Um lugar só, usado pelos e-mails de pedido, de carrinho e pela pré-visualização.
import { toSupportWhatsapp } from "@/lib/site/support-contact";
import { escapeHtml } from "./templates";

/** A campanha não tem prazo artificial; a assinatura é a mesma em todos os e-mails. */
export function emailTagline(): string {
  return "Seu verão vai ser muito mais divertido 💦";
}

const LINK = "color:#0b6fa4;font-weight:700;text-decoration:none;";

/**
 * `whatsapp` só sai quando o número do painel é válido: número incompleto vira link que não abre conversa,
 * então é melhor o e-mail oferecer só o contato por e-mail.
 */
export function brandVars(store: { name: string; whatsapp: string; email: string }): Record<string, string> {
  const wa = toSupportWhatsapp(String(store.whatsapp ?? ""));
  const email = store.email.trim();
  const parts: string[] = [];
  if (wa) parts.push(`pelo WhatsApp <a href="${wa.href}" style="${LINK}">${escapeHtml(wa.label)}</a>`);
  if (email) parts.push(`pelo e-mail <a href="mailto:${escapeHtml(email)}" style="${LINK}">${escapeHtml(email)}</a>`);
  return {
    loja: escapeHtml(store.name),
    frase: emailTagline(),
    whatsapp: wa ? wa.digits : "",
    email_suporte: escapeHtml(email),
    contato: parts.length ? parts.join(" ou ") : "respondendo este e-mail",
  };
}
