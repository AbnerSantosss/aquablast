import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";

/** Variáveis de exemplo para pré-visualizar e testar templates de e-mail. */
export async function sampleVars(): Promise<Record<string, string>> {
  const s = await getSettings(["store.name", "store.supportWhatsapp", "store.supportEmail", "store.trackingPageUrl"] as const);
  const base = env().APP_URL.replace(/\/$/, "");
  const trackingPath = s["store.trackingPageUrl"].startsWith("http") ? s["store.trackingPageUrl"] : base + s["store.trackingPageUrl"];
  return {
    nome: "Maria da Silva",
    primeiro_nome: "Maria",
    pedido: "AQB-260922-X1Z",
    codigo_acesso: "AQB-EXEMPLO-1234",
    link_rastreio: `${trackingPath}?codigo=AQB-EXEMPLO-1234`,
    codigo_transportadora: "BR123456789SP",
    transportadora: "Shopee Express (SPX)",
    link_transportadora: "https://spx.com.br/track?BR123456789SP",
    cliente: "Maria da Silva · maria@exemplo.com",
    pago_em: "27/09/2026 14:30",
    dias_atraso: "1",
    prazo_dias: "3",
    link_admin: `${base}/admin/pedidos`,
    pix_copia_cola: "00020126580014br.gov.bcb.pix0136exemplo-de-chave-pix-para-teste5204000053039865802BR",
    link_pagamento: `${base}/pagamento/exemplo`,
    valor: "R$ 129,90",
    itens: "1× AquaBlast (Azul)",
    loja: s["store.name"],
    whatsapp: s["store.supportWhatsapp"],
    email_suporte: s["store.supportEmail"],
  };
}
