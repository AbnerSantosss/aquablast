// Blocos HTML dos e-mails de status do pedido (pedido do dono, 2026-10-02). Viram os placeholders
// {{progresso}}, {{bloco_rastreio}}, {{bloco_acesso}} e {{mensagem}}: cada um some (string vazia) quando não se aplica,
// então o mesmo modelo serve para pedido com e sem rastreio, com e sem código de acesso.
import type { Order, OrderStatus } from "@/db/schema";
import { escapeHtml } from "./templates";

/** Só os campos que a linha do tempo usa (a pré-visualização do painel monta um pedido de exemplo com eles). */
export type ProgressOrder = Pick<Order, "status" | "paidAt" | "approvedAt" | "shippedAt" | "inTransitAt" | "outForDeliveryAt" | "deliveredAt">;
export type TrackingOrder = Pick<Order, "trackingCode" | "carrierName" | "trackingUrl">;

type Step = { status: OrderStatus; label: string; at: (o: ProgressOrder) => Date | null };

/** Etapas mostradas ao cliente, na ordem da entrega. */
const STEPS: Step[] = [
  { status: "approved", label: "Pago", at: (o) => o.paidAt ?? o.approvedAt },
  { status: "shipped", label: "Enviado", at: (o) => o.shippedAt },
  { status: "in_transit", label: "Em trânsito", at: (o) => o.inTransitAt },
  { status: "out_for_delivery", label: "Saiu para entrega", at: (o) => o.outForDeliveryAt },
  { status: "delivered", label: "Entregue", at: (o) => o.deliveredAt },
];

const STEP_RANK: Partial<Record<OrderStatus, number>> = { approved: 0, preparing: 0, shipped: 1, in_transit: 2, out_for_delivery: 3, delivered: 4 };

const BLUE = "#0ea5e9";
const ORANGE = "#f97316";
const RED = "#dc2626";
const GREY = "#e2e8f0";

/**
 * Linha do tempo em tabela (funciona em Gmail, Outlook e celular). Etapa concluída = azul com ✓, etapa atual = laranja,
 * futura = cinza. Em "Ocorrência" as etapas já feitas seguem azuis e a próxima aparece em vermelho com "!".
 */
export function progressHtml(order: ProgressOrder): string {
  const current = STEP_RANK[order.status] ?? -1;
  const done = STEPS.map((s, i) => i <= current || s.at(order) !== null);
  const lastDone = done.lastIndexOf(true);
  const look = STEPS.map((_, i) => {
    if (order.status === "exception" && i === lastDone + 1) return { bg: RED, fg: "#ffffff", mark: "!", weight: "800" };
    if (!done[i]) return { bg: GREY, fg: "#64748b", mark: String(i + 1), weight: "600" };
    const isCurrent = i === current && order.status !== "delivered";
    return isCurrent ? { bg: ORANGE, fg: "#ffffff", mark: String(i + 1), weight: "800" } : { bg: BLUE, fg: "#ffffff", mark: "&#10003;", weight: "600" };
  });
  // Três linhas (barra segmentada, bolinhas, nomes): sem position/margem negativa, que o Outlook e o Gmail ignoram.
  const bars = look.map((l) => `<td width="20%" style="padding:0 3px;"><div style="height:5px;line-height:5px;font-size:0;border-radius:3px;background:${l.bg};">&nbsp;</div></td>`).join("");
  const dots = look
    .map(
      (l) =>
        `<td width="20%" align="center" style="padding:10px 0 0;"><div style="width:30px;height:30px;line-height:30px;border-radius:50%;background:${l.bg};color:${l.fg};font-size:14px;font-weight:800;text-align:center;margin:0 auto;">${l.mark}</div></td>`,
    )
    .join("");
  // Na ocorrência, a etapa travada troca o nome por "Ocorrência" (não dá a entender que ela aconteceu).
  const labels = STEPS.map((s, i) => {
    const label = look[i].bg === RED ? `<span style="color:${RED};">Ocorrência</span>` : s.label;
    return `<td width="20%" align="center" valign="top" style="padding:6px 2px 0;font-size:12px;line-height:1.3;color:#0f2c3a;font-weight:${look[i].weight};">${label}</td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 22px;border-collapse:collapse;"><tr>${bars}</tr><tr>${dots}</tr><tr>${labels}</tr></table>`;
}

/** Caixa com transportadora, código de rastreio e link do site da transportadora. Vazia sem código de rastreio. */
export function trackingBlockHtml(order: TrackingOrder): string {
  if (!order.trackingCode) return "";
  const carrier = order.carrierName ? escapeHtml(order.carrierName) : "Transportadora";
  const link = order.trackingUrl
    ? `<div style="margin-top:8px;font-size:14px;"><a href="${escapeHtml(order.trackingUrl)}" style="color:#0284c7;font-weight:700;">Abrir rastreio no site da transportadora</a></div>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:separate;"><tr><td style="padding:14px 16px;background:#f4fbfe;border:1px solid #cdeaf6;border-radius:12px;">
      <div style="font-size:12px;font-weight:700;color:#4b6675;text-transform:uppercase;letter-spacing:.4px;">${carrier} · código de rastreio</div>
      <div style="font-family:Consolas,monospace;font-size:17px;font-weight:700;color:#0f2c3a;margin-top:4px;word-break:break-all;">${escapeHtml(order.trackingCode)}</div>
      ${link}
    </td></tr></table>`;
}

/** Código de acesso ao rastreio do site. Vazio quando o e-mail não leva código (ex.: aviso automático da transportadora). */
export function accessBlockHtml(accessCode: string | undefined): string {
  if (!accessCode) return "";
  return `<p style="margin:0 0 6px;font-size:14px;color:#4b6675;">Seu código de acesso para acompanhar o pedido no nosso site:</p>
      <p style="margin:0 0 6px;padding:12px 16px;background:#f1f5f9;border:1px dashed #94a3b8;border-radius:12px;font-family:Consolas,monospace;font-size:15px;word-break:break-all;">${escapeHtml(accessCode)}</p>
      <p style="margin:0;font-size:12px;color:#64748b;">Este código substitui os enviados antes.</p>`;
}

/** Recado escrito pela equipe no painel (campo Descrição ao mudar o status). Escapado; quebras de linha viram <br>. */
export function messageBlockHtml(message: string | undefined): string {
  const text = message?.trim();
  if (!text) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:separate;"><tr><td style="padding:14px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;">
      <div style="font-size:12px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:.4px;">Recado da nossa equipe</div>
      <div style="font-size:15px;color:#0f2c3a;margin-top:4px;">${escapeHtml(text).replace(/\r?\n/g, "<br>")}</div>
    </td></tr></table>`;
}
