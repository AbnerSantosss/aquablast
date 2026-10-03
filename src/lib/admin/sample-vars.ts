import { env } from "@/lib/env";
import { brandVars } from "@/lib/email/brand-vars";
import { accessBlockHtml, messageBlockHtml, progressHtml } from "@/lib/email/status-blocks";
import { PUBLIC_CARRIER_LABEL } from "@/lib/tracking/public";
import { getSettings } from "@/lib/settings";

/** Mesmo formato do código real (lib/crypto generateAccessCode): BR + 13 dígitos. Não corresponde a pedido nenhum. */
const SAMPLE_CODE = "BR0000000000000";

/** Variáveis de exemplo para pré-visualizar e testar templates de e-mail. */
export async function sampleVars(): Promise<Record<string, string>> {
  const s = await getSettings(["store.name", "store.supportWhatsapp", "store.supportEmail", "store.trackingPageUrl"] as const);
  const base = env().APP_URL.replace(/\/$/, "");
  const trackingPath = s["store.trackingPageUrl"].startsWith("http") ? s["store.trackingPageUrl"] : base + s["store.trackingPageUrl"];
  return {
    nome: "Maria da Silva",
    primeiro_nome: "Maria",
    pedido: "AQB-260922-X1Z",
    codigo_acesso: SAMPLE_CODE,
    link_rastreio: `${trackingPath}?codigo=${SAMPLE_CODE}`,
    // Igual ao envio real (lib/email/send.ts): o cliente não vê a transportadora, o código dela nem link externo.
    codigo_transportadora: "",
    transportadora: PUBLIC_CARRIER_LABEL,
    link_transportadora: `${trackingPath}?codigo=${SAMPLE_CODE}`,
    cliente: "Maria da Silva · maria@exemplo.com",
    pago_em: "27/09/2026 14:30",
    dias_atraso: "1",
    prazo_dias: "3",
    link_admin: `${base}/admin/pedidos`,
    pix_copia_cola: "00020126580014br.gov.bcb.pix0136exemplo-de-chave-pix-para-teste5204000053039865802BR",
    link_pagamento: `${base}/pagamento/exemplo`,
    valor: "R$ 129,90",
    itens: "1× AquaBlast (Azul)",
    ...brandVars({ name: s["store.name"], whatsapp: String(s["store.supportWhatsapp"] ?? ""), email: s["store.supportEmail"] }),
    status: "Em trânsito",
    progresso: progressHtml({
      status: "in_transit",
      paidAt: new Date("2026-09-27T14:30:00-03:00"),
      approvedAt: null,
      shippedAt: new Date("2026-09-28T10:00:00-03:00"),
      inTransitAt: new Date("2026-09-29T08:00:00-03:00"),
      outForDeliveryAt: null,
      deliveredAt: null,
    }),
    bloco_rastreio: "",
    bloco_acesso: accessBlockHtml(SAMPLE_CODE),
    mensagem: messageBlockHtml("Exemplo de recado: o texto que você escrever em Descrição ao mudar o status aparece aqui."),
  };
}
