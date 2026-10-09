import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailLog, type CheckoutCart, type Order } from "@/db/schema";
import { formatBRL, formatDateTime, formatPhone, whatsappLink } from "@/lib/admin/format";
import { isColor, selectionFromCart, titleOf, variantOf, type Selection } from "@/lib/checkout/own/catalog";
import { env } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";
import { pushCheckoutEvent, type AlertSummary } from "@/lib/push/checkout-push";
import { getSettings, type AdminAlertEvent } from "@/lib/settings";
import { COLOR_LABELS } from "@/lib/site/constants";
import { getEmailProvider } from "./provider";
import { absoluteUrl } from "./send";
import { escapeHtml, htmlToText, internalFrame } from "./templates";

/**
 * Avisos por e-mail para a equipe durante o checkout (pedido do dono, 2026-09-30): checkout aberto,
 * chegada na etapa de pagamento, Pix gerado, cada tentativa no cartão, falha do gateway e pedido pago.
 *
 * - Destino: `alerts.adminEmail`; vazio = `ADMIN_EMAIL` do ambiente (o login do painel), para o
 *   endereço não precisar ficar no código nem no repositório.
 * - Cada aviso liga/desliga em Configurações > Envios (`alerts.events`).
 * - Cartão: só bandeira, final e parcelas. Número, validade e CVV nunca chegam aqui.
 * - Nunca lança: quem chama está dentro de `after()` ou do fluxo de pagamento.
 * - HTML fixo (não entra nos modelos editáveis); fica no email_log com `template_key = alerta_<evento>`.
 * - Push do app do painel (ajuste do dono, 2026-09-30): os mesmos eventos, pelo mesmo gancho, em paralelo e
 *   independente do e-mail (lib/push/checkout-push.ts). Liga/desliga fino em `alerts.pushEvents`.
 */

export type CheckoutAlertEvent = Exclude<AdminAlertEvent, "atraso">;

export interface CheckoutAlertAttempt {
  method: "pix" | "card" | string;
  /** paid | pending | refused | error | canceled */
  status: string;
  amountCents?: number | null;
  installments?: number | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  /** Motivo do gateway, já sem sequências de dígitos (scrub da rota de pagamento). */
  reason?: string | null;
  gateway?: string | null;
}

export interface CheckoutAlert {
  event: CheckoutAlertEvent;
  cart?: CheckoutCart | null;
  order?: Order | null;
  attempt?: CheckoutAlertAttempt | null;
  /** Só no evento `falha`: o que deu errado, em texto curto (nunca dado de cartão). */
  problem?: string | null;
  /**
   * Só no evento `inicio`: a página do checkout foi aberta (POST /api/checkout/opened), antes de existir
   * carrinho. Desde 2026-09-30 o `inicio` sai daqui, e não mais quando o carrinho nasce no e-mail digitado.
   */
  visit?: { selection: Selection; amountCents: number | null; origin?: string } | null;
}

/** Quem recebe os avisos da equipe: o e-mail do painel ou, vazio, o ADMIN_EMAIL do ambiente. */
export async function adminAlertRecipient(): Promise<string> {
  const s = await getSettings(["alerts.adminEmail"] as const);
  const stored = String(s["alerts.adminEmail"] ?? "").trim().toLowerCase();
  return stored || (env().ADMIN_EMAIL ?? "").trim().toLowerCase();
}

/** O aviso está ligado em `alerts.events`? */
export async function adminAlertEnabled(event: AdminAlertEvent): Promise<boolean> {
  const s = await getSettings(["alerts.events"] as const);
  const list: readonly string[] = Array.isArray(s["alerts.events"]) ? s["alerts.events"] : [];
  return list.includes(event);
}

const ATTEMPT_LABEL: Record<string, string> = {
  paid: "APROVADO",
  pending: "EM ANÁLISE",
  refused: "RECUSADO",
  canceled: "CANCELADO",
  error: "COM ERRO",
};

function colorLabel(c: string | undefined): string {
  return c && isColor(c) ? COLOR_LABELS[c] : "";
}

function productOf(order: Order | null | undefined, cart: CheckoutCart | null | undefined, visit?: CheckoutAlert["visit"]): string {
  if (order?.items?.length) return order.items.map((i) => `${i.quantity}× ${i.name}${i.variant ? ` (${i.variant})` : ""}`).join(" + ");
  if (!cart) return visit ? `${titleOf(visit.selection)} (${variantOf(visit.selection)})` : "—";
  const sel = selectionFromCart(cart);
  let text = `${titleOf(sel)} (${variantOf(sel)})`;
  if (sel.pack === "unit" && cart.bumpAccepted) text += ` + 2ª unidade${colorLabel(cart.colors[1]) ? ` (${colorLabel(cart.colors[1])})` : " (cor ainda não escolhida)"}`;
  return text;
}

function paymentOf(a: CheckoutAlertAttempt | null | undefined, order: Order | null | undefined): string {
  const method = a?.method ?? order?.paymentMethod ?? "";
  if (method === "pix") return "Pix";
  if (method === "card" || method === "credit_card") {
    const brand = a?.cardBrand ? ` ${a.cardBrand}` : "";
    const last4 = a?.cardLast4 ? ` final ${a.cardLast4}` : "";
    const parcelas = a?.installments && a.installments > 1 ? ` em ${a.installments}x` : a?.installments === 1 ? " à vista" : "";
    return `Cartão${brand}${last4}${parcelas}`;
  }
  return method || "—";
}

function subjectOf(a: CheckoutAlert, who: string, value: string, store: string): string {
  const num = a.order?.orderNumber ? `pedido ${a.order.orderNumber}` : "";
  const parts = (...p: string[]) => p.filter(Boolean).join(" · ");
  switch (a.event) {
    case "inicio":
      return `[${store}] Checkout aberto: ${parts(who, value)}`;
    case "pagamento":
      return `[${store}] Chegou no pagamento: ${parts(who, value)}`;
    case "pix":
      return `[${store}] Pix gerado: ${parts(num, who, value)}`;
    case "cartao":
      return `[${store}] Cartão ${ATTEMPT_LABEL[a.attempt?.status ?? ""] ?? "tentativa"}: ${parts(num, who, value)}`;
    case "falha":
      return `[${store}] FALHA no pagamento${a.attempt?.gateway ? ` (${a.attempt.gateway})` : ""}: ${parts(num, who, value)}`;
    case "pago":
      return `[${store}] Pedido pago: ${parts(num, who, value)}`;
  }
}

const EVENT_TITLE: Record<CheckoutAlertEvent, string> = {
  inicio: "Alguém abriu o checkout",
  pagamento: "Cliente chegou na etapa de pagamento",
  pix: "Pix gerado (aguardando pagamento)",
  cartao: "Tentativa de pagamento no cartão",
  falha: "Falha no pagamento: o gateway não cobrou",
  pago: "Pedido pago",
};

function row(label: string, valueHtml: string): string {
  return `<tr><td valign="top" style="padding:6px 12px 6px 0;font-family:Arial,Helvetica,sans-serif;color:#4b6a78;font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;">${valueHtml}</td></tr>`;
}

/** Já saiu este aviso (com sucesso) para o carrinho/pedido? Evita repetir início, pagamento e pago. */
async function alreadySent(templateKey: string, a: CheckoutAlert): Promise<boolean> {
  const byOrder = a.event === "pago" && a.order;
  const byCart = (a.event === "inicio" || a.event === "pagamento") && a.cart;
  if (!byOrder && !byCart) return false;
  const where = byOrder
    ? and(eq(emailLog.templateKey, templateKey), eq(emailLog.orderId, a.order!.id), eq(emailLog.status, "sent"))
    : and(eq(emailLog.templateKey, templateKey), eq(emailLog.cartId, a.cart!.id), eq(emailLog.status, "sent"));
  const found = await db.query.emailLog.findFirst({ where, columns: { id: true } });
  return !!found;
}

function centsOf(a: CheckoutAlert): number | null {
  const { cart, order, attempt, visit } = a;
  return attempt?.amountCents ?? (order ? Math.round(Number(order.amountTotal) * 100) : (cart?.amountCents ?? visit?.amountCents ?? null));
}

function cityOf(a: CheckoutAlert): string {
  const { cart, order } = a;
  return [cart?.addressCity ?? order?.addressCity, cart?.addressState ?? order?.addressState].filter(Boolean).join("/");
}

/** Resumo curto do evento para o push (sem nome, e-mail nem telefone: a notificação aparece na tela bloqueada). */
function summaryOf(a: CheckoutAlert): AlertSummary {
  const cents = centsOf(a);
  return {
    product: productOf(a.order, a.cart, a.visit),
    payment: a.attempt || a.order?.paymentMethod ? paymentOf(a.attempt, a.order) : "",
    value: cents !== null && Number.isFinite(cents) ? formatBRL(cents / 100) : "",
    city: cityOf(a),
    attemptLabel: a.attempt ? (ATTEMPT_LABEL[a.attempt.status] ?? a.attempt.status.toUpperCase()) : "",
  };
}

/**
 * Manda o aviso do evento para a equipe, se ligado em `alerts.events`: e-mail (com destinatário) e push
 * (com aparelho inscrito), em paralelo e independentes. Nunca lança.
 */
export async function notifyCheckoutEvent(a: CheckoutAlert): Promise<void> {
  try {
    if (!(await adminAlertEnabled(a.event))) return;
  } catch (err) {
    log.error("aviso do checkout: falha ao ler a configuração", { event: a.event, error: errorMessage(err) });
    return;
  }
  let summary: AlertSummary | null = null;
  try {
    summary = summaryOf(a);
  } catch (err) {
    log.warn("aviso do checkout: resumo do push falhou", { event: a.event, error: errorMessage(err) });
  }
  await Promise.all([emailCheckoutEvent(a), summary ? pushCheckoutEvent(a, summary) : Promise.resolve()]);
}

/** Parte do e-mail do aviso (o toggle `alerts.events` já foi conferido). Nunca lança. */
async function emailCheckoutEvent(a: CheckoutAlert): Promise<void> {
  const templateKey = `alerta_${a.event}`;
  try {
    const to = await adminAlertRecipient();
    if (!to) return;
    if (await alreadySent(templateKey, a)) return;

    const s = await getSettings(["store.name", "email.provider"] as const);
    const store = s["store.name"];
    const { cart, order, attempt } = a;
    const name = order?.customerName ?? cart?.customerName ?? "";
    const email = order?.customerEmail ?? cart?.customerEmail ?? "";
    const phone = order?.customerPhone ?? cart?.customerPhone ?? "";
    const cents = centsOf(a);
    const value = cents !== null && Number.isFinite(cents) ? formatBRL(cents / 100) : "";
    const who = name || email || "visitante (ainda sem dados)";
    const subject = subjectOf(a, who, value, store);

    const wa = whatsappLink(phone);
    const city = cityOf(a);
    const utm = cart?.utm ?? null;
    const origin = utm ? [utm.utm_source, utm.utm_campaign].filter(Boolean).join(" · ") : (a.visit?.origin ?? "");
    const rows = [
      row("Quando", escapeHtml(formatDateTime(new Date()))),
      row("Cliente", escapeHtml(name || "— (ainda não preencheu)")),
      email ? row("E-mail", escapeHtml(email)) : "",
      phone ? row("WhatsApp", wa ? `<a href="${escapeHtml(wa)}">${escapeHtml(formatPhone(phone))}</a>` : escapeHtml(formatPhone(phone))) : "",
      row("Produto", escapeHtml(productOf(order, cart, a.visit))),
      value ? row("Valor", escapeHtml(value)) : "",
      attempt || order?.paymentMethod ? row("Pagamento", escapeHtml(paymentOf(attempt, order))) : "",
      attempt && a.event === "cartao" ? row("Resultado", `<strong>${escapeHtml(ATTEMPT_LABEL[attempt.status] ?? attempt.status)}</strong>`) : "",
      a.problem ? row("Problema", `<strong>${escapeHtml(a.problem.slice(0, 200))}</strong>`) : "",
      attempt?.reason && attempt.status !== "paid" ? row("Motivo (gateway)", escapeHtml(attempt.reason.slice(0, 200))) : "",
      attempt?.gateway ? row("Gateway", escapeHtml(attempt.gateway)) : "",
      city ? row("Cidade", escapeHtml(city)) : "",
      origin ? row("Origem", escapeHtml(origin)) : "",
      order ? row("Pedido", `<a href="${escapeHtml(absoluteUrl(`/admin/pedidos/${order.id}`))}">${escapeHtml(order.orderNumber)}</a>`) : "",
    ].join("");
    const cartsLink = absoluteUrl("/admin/carrinhos");
    const html = internalFrame(`
    <p style="margin:0 0 4px;font-size:12px;color:#4b6a78;text-transform:uppercase;letter-spacing:.04em;">Aviso do checkout · ${escapeHtml(store)}</p>
    <p style="margin:0 0 16px;font-size:18px;font-weight:700;">${escapeHtml(EVENT_TITLE[a.event])}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">${rows}</table>
    <p style="margin:18px 0 0;font-size:13px;"><a href="${escapeHtml(cartsLink)}">Ver carrinhos no painel</a></p>
    <p style="margin:14px 0 0;font-size:12px;color:#4b6a78;">Escolha quais avisos chegam em Configurações &gt; Envios no painel.</p>`);

    const triggeredBy = "system:alerta";
    try {
      const provider = await getEmailProvider();
      const { messageId } = await provider.send({ to, subject, html, text: htmlToText(html) });
      await db.insert(emailLog).values({ orderId: order?.id ?? null, cartId: cart?.id ?? order?.cartId ?? null, to, templateKey, subject, provider: provider.kind, status: "sent", messageId, triggeredBy });
    } catch (err) {
      const message = errorMessage(err).slice(0, 1000);
      await db.insert(emailLog).values({ orderId: order?.id ?? null, cartId: cart?.id ?? order?.cartId ?? null, to, templateKey, subject, provider: s["email.provider"], status: "error", error: message, triggeredBy });
      log.warn("aviso do checkout não enviado", { event: a.event, error: message });
    }
  } catch (err) {
    log.error("aviso do checkout: falha", { event: a.event, error: errorMessage(err) });
  }
}
