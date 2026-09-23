"use client";
/* eslint-disable @next/next/no-img-element -- ícones SVG estáticos, iguais ao site original */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  createTrackingClient,
  stageIndex,
  trackingConfig,
  type ConnectionState,
  type TrackingError,
  type Subscription,
  type TrackingClient,
  type TrackingOrder,
  type TrackingStatus,
} from "@/lib/tracking/client";

/*
 * Port de `site/rastrear/tracking-v47.js` para React. Mesmos ids, classes e textos do
 * `site/rastrear/index.html`; a demonstração com dados fictícios foi removida.
 */

const labels = ["Pedido realizado", "Compra aprovada", "Pedido enviado", "Saiu para entrega", "Pedido entregue"] as const;

const statusLabels: Record<TrackingStatus, string> = {
  created: "Pedido realizado",
  approved: "Compra aprovada",
  preparing: "Em preparação",
  shipped: "Pedido enviado",
  in_transit: "Em trânsito",
  out_for_delivery: "Saiu para entrega",
  delivered: "Pedido entregue",
  exception: "Entrega com ocorrência",
  cancelled: "Pedido cancelado",
};

const descriptions: Record<TrackingStatus, string> = {
  created: "Seu pedido foi registrado. Aguardando a confirmação do pagamento.",
  approved: "Pagamento confirmado. Seu pedido seguirá para preparação.",
  preparing: "Seu pedido está sendo preparado para o envio.",
  shipped: "Seu pedido já foi enviado. Acompanhe as próximas movimentações abaixo.",
  in_transit: "Seu AquaBlast está em transporte até a sua região.",
  out_for_delivery: "Seu pedido está na rota de entrega para o endereço informado.",
  delivered: "Entrega concluída. Agora é hora de criar boas lembranças!",
  exception: "A transportadora informou uma ocorrência. Confira o histórico ou fale com o atendimento.",
  cancelled: "Este pedido foi cancelado. Fale com o atendimento se precisar de ajuda.",
};

const stepIcons = ["/icons/package-tracking.svg", "/icons/badge-check.svg", "/icons/truck.svg", "/icons/package-tracking.svg", "/icons/check.svg"] as const;

const DEFAULT_FEEDBACK = "Consulte seu pedido para visualizar os dados e as etapas da entrega.";
const IDLE_CONNECTION = "Aguardando consulta";
const CODE_PATTERN = /^[A-Za-z0-9_-]{5,200}$/;
const EVENTS_PREVIEW = 6;

const connectionMessages: Record<ConnectionState, string> = {
  live: "Atualizações em tempo real conectadas",
  polling: "Atualização automática a cada " + Math.round(Math.max(10_000, trackingConfig.pollIntervalMs) / 1000) + " s",
  reconnecting: "Conexão interrompida · tentando novamente",
  paused: "Atualização pausada enquanto esta aba está oculta",
};

const formatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const formatDate = (value: string | null | undefined): string => (value ? formatter.format(new Date(value)) : "");

function formatAddress(order: TrackingOrder | null): string {
  if (!order) return "O endereço informado no checkout será exibido após uma consulta autorizada.";
  const a = order.deliveryAddress;
  const lines = [a.line1, a.line2, a.neighborhood, [a.city, a.state].filter(Boolean).join(" — "), a.postalCode ? "CEP " + a.postalCode : "", a.country];
  return lines.filter(Boolean).join("\n") || "Endereço não disponibilizado na consulta.";
}

function shippingState(order: TrackingOrder | null, idx: number): string {
  if (!order) return IDLE_CONNECTION;
  if (order.status === "delivered") return "Entregue";
  if (order.shippedAt || idx >= 2) return "Já enviado";
  if (order.status === "cancelled") return "Pedido cancelado";
  return "Ainda não enviado";
}

function remainingSteps(order: TrackingOrder | null, idx: number, alert: boolean): string {
  if (!order) return "As etapas pendentes serão destacadas automaticamente.";
  if (alert) return "Confira os detalhes no histórico. Nenhuma etapa será avançada automaticamente.";
  if (idx === 4) return "Todas as etapas de entrega foram concluídas.";
  return "Próximas etapas: " + labels.slice(idx + 1).join(" → ") + ".";
}

interface TrackingPageProps {
  /** Valor de `?codigo=` na URL: preenche o campo e dispara a consulta ao montar. */
  initialCode?: string;
}

export default function TrackingPage({ initialCode = "" }: TrackingPageProps) {
  const [code, setCode] = useState(initialCode);
  const [order, setOrder] = useState<TrackingOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState(DEFAULT_FEEDBACK);
  const [formError, setFormError] = useState<string | null>(null);
  const [connection, setConnection] = useState(IDLE_CONNECTION);
  const [expanded, setExpanded] = useState(false);
  const [approval, setApproval] = useState({ animate: false, key: 0 });

  const clientRef = useRef<TrackingClient | null>(null);
  const orderRef = useRef<TrackingOrder | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const serialRef = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSubmitted = useRef(false);
  /** Houve consulta autorizada nesta visita (logo, pode existir cookie de sessão). */
  const sessionRef = useRef(false);

  const getClient = useCallback((): TrackingClient => {
    clientRef.current ??= createTrackingClient(trackingConfig);
    return clientRef.current;
  }, []);

  /** Equivalente ao `render(next)` original: troca o pedido e decide se anima a aprovação. */
  const render = useCallback((next: TrackingOrder | null) => {
    const previous = orderRef.current;
    orderRef.current = next;
    setOrder(next);
    const idx = stageIndex(next);
    const alert = Boolean(next && (next.status === "cancelled" || next.status === "exception"));
    const approved = Boolean(next && idx === 1 && !alert);
    if (approved && next && (!previous || previous.id !== next.id || stageIndex(previous) < 1)) {
      setApproval((state) => ({ animate: true, key: state.key + 1 }));
    }
  }, []);

  const stop = useCallback(() => {
    subscriptionRef.current?.stop();
    subscriptionRef.current = null;
    requestRef.current?.abort();
    requestRef.current = null;
    serialRef.current++;
    setBusy(false);
  }, []);

  const updateConnection = useCallback((state: ConnectionState | "") => {
    setConnection(state ? connectionMessages[state] : IDLE_CONNECTION);
  }, []);

  const showError = useCallback(
    (error: TrackingError, fatal = false) => {
      const message = error.message || "Não foi possível consultar seu pedido.";
      if (fatal) {
        stop();
        render(null);
        setConnection("Consulta encerrada");
      }
      setFeedback(fatal ? message : message + " Os últimos dados recebidos continuam na tela.");
    },
    [render, stop],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = (inputRef.current?.value ?? "").replace(/\s+/g, "");
      if (!CODE_PATTERN.test(value)) {
        setFormError("Confira seu código: use apenas letras, números, hífens ou sublinhados, sem espaços.");
        inputRef.current?.focus();
        return;
      }
      stop();
      setExpanded(false);
      render(null);
      updateConnection("");
      setFormError(null);
      setBusy(true);
      setFeedback("Consultando seu pedido…");
      const controller = new AbortController();
      requestRef.current = controller;
      const serial = serialRef.current;
      const client = getClient();
      try {
        const result = await client.lookup(value, controller.signal);
        if (serial !== serialRef.current) return;
        sessionRef.current = true;
        render(result);
        setFeedback("Pedido consultado. Status atual: " + statusLabels[result.status] + ".");
        subscriptionRef.current = client.subscribe(value, result, {
          onUpdate(next) {
            const oldStatus = orderRef.current?.status;
            render(next);
            if (oldStatus !== next.status) setFeedback("Pedido atualizado: " + statusLabels[next.status] + ".");
          },
          onConnection: updateConnection,
          onError: showError,
        });
      } catch (error) {
        if (serial !== serialRef.current) return;
        setFormError(error instanceof Error ? error.message : "Não foi possível consultar seu pedido.");
        setFeedback("Não foi possível concluir a consulta.");
        updateConnection("");
      } finally {
        if (serial === serialRef.current) {
          requestRef.current = null;
          setBusy(false);
        }
      }
    },
    [getClient, render, showError, stop, updateConnection],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await subscriptionRef.current?.refresh();
    } finally {
      setRefreshing(false);
    }
  }, []);

  // O CSS original mira `body.tracking-page` (zera o padding inferior do site, por exemplo).
  useEffect(() => {
    document.body.classList.add("tracking-page");
    return () => document.body.classList.remove("tracking-page");
  }, []);

  // `?codigo=` — preenche e envia uma vez; depois tira o código da URL/histórico.
  useEffect(() => {
    if (!initialCode || autoSubmitted.current) return;
    autoSubmitted.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.has("codigo")) {
      url.searchParams.delete("codigo");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    formRef.current?.requestSubmit();
  }, [initialCode]);

  // Ao sair da página: encerra stream, limpa os dados e apaga a sessão do comprador.
  useEffect(() => {
    const onPageHide = () => {
      stop();
      render(null);
      setExpanded(false);
      setCode("");
      if (!sessionRef.current) return;
      sessionRef.current = false;
      void fetch("/api/orders/logout", { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => undefined);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      stop();
    };
  }, [render, stop]);

  const idx = stageIndex(order);
  const alert = Boolean(order && (order.status === "cancelled" || order.status === "exception"));
  const approved = Boolean(order && idx === 1 && !alert);
  const dates = order ? [order.createdAt, order.approvedAt, order.shippedAt, order.outForDeliveryAt, order.deliveredAt] : [];
  const events = order?.events ?? [];
  const shownEvents = expanded ? events : events.slice(0, EVENTS_PREVIEW);

  return (
    <div className="tracking-page">
      <a className="skip" href="#rastreamento">
        Ir para o acompanhamento
      </a>
      <header className="header">
        <div className="container nav-inner">
          <Link className="brand" href="/" aria-label="AquaBlast início">
            <img className="brand-symbol" src="/icons/droplets.svg" alt="" />
            <span>
              Aqua<b>Blast</b>
              <small>DIVERSÃO QUE APROXIMA</small>
            </span>
          </Link>
          <Link className="tracking-back" href="/">
            ← Voltar à loja
          </Link>
        </div>
      </header>
      <main id="rastreamento" className="tracking-main">
        <div className="tracking-shell">
          <div className="tracking-heading">
            <span className="eyebrow">DA COMPRA À SUA PORTA</span>
            <h1>
              Acompanhe seu <em>pedido.</em>
            </h1>
            <p>Cada etapa da entrega, em um só lugar.</p>
          </div>
          <section className="lookup-card" aria-labelledby="lookup-title">
            <div>
              <h2 id="lookup-title">Consultar meu pedido</h2>
              <p>Use o código de acesso enviado na confirmação da compra.</p>
            </div>
            <form id="tracking-form" noValidate ref={formRef} onSubmit={handleSubmit}>
              <label htmlFor="tracking-code">Código de acesso do pedido</label>
              <div className="lookup-fields">
                <input
                  id="tracking-code"
                  ref={inputRef}
                  type="text"
                  maxLength={200}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  placeholder="Digite ou cole seu código"
                  aria-describedby="tracking-help tracking-error"
                  aria-invalid={formError ? "true" : undefined}
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setFormError(null);
                  }}
                />
                <button id="lookup-submit" className="button button-green" type="submit" disabled={busy}>
                  <img className="icon" src="/icons/package-tracking.svg" alt="" />
                  <span>{busy ? "Consultando…" : "Consultar pedido"}</span>
                </button>
              </div>
              <p id="tracking-help">Não informe CPF, cartão ou senha. O código da transportadora pode ser consultado na opção abaixo.</p>
              <p id="tracking-error" className="form-error" role="alert" hidden={!formError}>
                {formError ?? ""}
              </p>
            </form>
            <div className="lookup-footer">
              <span id="integration-notice">Consulte seu pedido com o código de acesso recebido na confirmação da compra.</span>
            </div>
          </section>
          <p id="tracking-feedback" className="tracking-feedback" role="status" aria-live="polite" aria-atomic="true">
            {feedback}
          </p>
          <section id="order-panel" className="order-panel" aria-labelledby="order-title" aria-busy={busy}>
            <div className="order-topbar">
              <h2 id="order-title">Seu pedido</h2>
              <div className="order-reference">
                <span>
                  ID DO PEDIDO <strong id="order-id">{order?.id || "—"}</strong>
                </span>
                <span
                  id="order-status"
                  className={"order-status" + (order?.status === "delivered" ? " is-success" : "") + (alert ? " is-alert" : "")}
                >
                  {order ? statusLabels[order.status] : IDLE_CONNECTION}
                </span>
              </div>
            </div>
            <div id="approval-banner" className={"approval-banner" + (approval.animate ? " animate" : "")} hidden={!approved}>
              <svg key={approval.key} className="approval-check" viewBox="0 0 52 52" fill="none" aria-hidden="true">
                <circle cx="26" cy="26" r="23" />
                <path d="m15 26 8 8 15-17" />
              </svg>
              <div>
                <strong>Compra aprovada!</strong>
                <p>Pagamento confirmado. Agora é acompanhar cada etapa até a entrega.</p>
              </div>
            </div>
            <ol className="order-steps" aria-label="Etapas do pedido">
              {labels.map((label, index) => {
                const complete = idx >= index && (index < idx || idx === 4);
                const current = idx === index && idx < 4 && !alert;
                const dateText = dates[index]
                  ? formatDate(dates[index])
                  : !order
                    ? index
                      ? "—"
                      : IDLE_CONNECTION
                    : index <= idx
                      ? "Confirmado"
                      : alert
                        ? "Não concluído"
                        : "Aguardando";
                const stateText = !order ? "Não consultado" : complete ? "Concluído" : current ? "Etapa atual" : alert ? "Não concluído" : "Etapa pendente";
                return (
                  <li
                    key={label}
                    data-step={index}
                    className={[complete ? "is-complete" : "", current ? "is-current" : ""].filter(Boolean).join(" ") || undefined}
                    aria-current={current ? "step" : undefined}
                  >
                    <span className="step-circle">
                      <img src={stepIcons[index]} alt="" />
                    </span>
                    <strong>{label}</strong>
                    <span className="step-date">{dateText}</span>
                    <span className="step-state visually-hidden">{stateText}</span>
                  </li>
                );
              })}
            </ol>
            <div className="order-actions">
              <div>
                <strong id="stage-heading">{order ? statusLabels[order.status] : "Do primeiro clique ao sorriso na entrega."}</strong>
                <p id="stage-description">{order ? descriptions[order.status] : "Após a consulta, você verá aqui o andamento do seu pedido."}</p>
                <p id="remaining-steps" className="remaining-steps">
                  {remainingSteps(order, idx, alert)}
                </p>
              </div>
              <div className="order-action-buttons">
                <Link className="button button-green" href="/#ofertas">
                  Comprar novamente
                </Link>
                <Link className="button button-outline" href="/#contato">
                  Falar com atendimento
                </Link>
              </div>
            </div>
            <div className="delivery-details">
              <section className="delivery-address" aria-labelledby="address-title">
                <span className="section-kicker">DESTINO DA DIVERSÃO</span>
                <h2 id="address-title">Endereço de entrega</h2>
                <strong id="buyer-name">{order ? order.buyer.name || "Nome não informado" : "Nome do comprador"}</strong>
                <address id="delivery-address">{formatAddress(order)}</address>
                <p className="privacy-note">
                  <img src="/icons/shield-check.svg" alt="" />
                  Não compartilhe seu código de acesso.
                </p>
              </section>
              <section className="delivery-history" aria-labelledby="history-title">
                <div className="history-heading">
                  <div>
                    <span className="section-kicker">ACOMPANHAMENTO</span>
                    <h2 id="history-title">Histórico da entrega</h2>
                  </div>
                  <button id="refresh-order" className="text-button" type="button" hidden={!order} disabled={refreshing} onClick={handleRefresh}>
                    Atualizar agora
                  </button>
                </div>
                <dl className="shipping-facts">
                  <div>
                    <dt>Envio</dt>
                    <dd id="shipping-state">{shippingState(order, idx)}</dd>
                  </div>
                  <div>
                    <dt>Transportadora</dt>
                    <dd id="carrier">{order?.tracking.carrier || "—"}</dd>
                  </div>
                  <div>
                    <dt>Código de rastreamento</dt>
                    <dd id="shipment-code">{order ? order.tracking.code || "Ainda não disponível" : "Ainda não consultado"}</dd>
                  </div>
                </dl>
                <ol id="order-events" className="order-events">
                  {shownEvents.map((event, index) => (
                    <li key={event.id + ":" + index}>
                      <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
                      <div>
                        <strong>{event.title}</strong>
                        <p>{event.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <p id="history-empty" className="history-empty" hidden={events.length > 0}>
                  {order ? "Nenhuma movimentação registrada pela transportadora até o momento." : "As movimentações da transportadora aparecerão aqui, com data e horário."}
                </p>
                <button
                  id="more-events"
                  className="text-button"
                  type="button"
                  hidden={events.length <= EVENTS_PREVIEW}
                  aria-expanded={expanded}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? "Ver menos atualizações" : "Ver mais atualizações"}
                </button>
                <div className="connection-row">
                  <span id="connection-state">{connection}</span>
                  <time id="last-update" dateTime={order ? order.updatedAt : undefined}>
                    {order ? "Atualizado: " + formatDate(order.updatedAt) : ""}
                  </time>
                </div>
              </section>
            </div>
          </section>
          <section className="tracking-help" aria-label="Ajuda com o rastreamento">
            <details>
              <summary>Já tenho um código da transportadora</summary>
              <p>Você também pode consultar o código de rastreamento no 17TRACK.</p>
              <form action="https://t.17track.net/" method="get" target="_blank" rel="noopener noreferrer" id="carrier-form">
                <label htmlFor="carrier-code">Código de rastreamento da transportadora</label>
                <div className="lookup-fields">
                  <input
                    id="carrier-code"
                    name="nums"
                    pattern="[A-Za-z0-9-]{5,50}"
                    minLength={5}
                    maxLength={50}
                    required
                    autoComplete="off"
                    placeholder="Código recebido após o envio"
                  />
                  <button className="button button-outline" type="submit">
                    Consultar no 17TRACK ↗
                  </button>
                </div>
                <p className="external-notice">Ao continuar, somente o código informado será enviado ao 17TRACK, que abrirá em outra aba.</p>
              </form>
            </details>
            <details>
              <summary>Não recebi o código ou preciso corrigir meu endereço</summary>
              <p>
                Confira as mensagens de confirmação da compra. Para localizar seu pedido ou solicitar uma correção, fale com a nossa atendente. Não publique seu código de acesso
                nem seu endereço em comentários.
              </p>
              <a className="whatsapp-support" href="https://wa.me/5581996584578" target="_blank" rel="noopener noreferrer">
                <img src="/icons/whatsapp.svg" alt="" />
                Falar com a atendente no WhatsApp <span aria-hidden="true">↗</span>
              </a>
            </details>
          </section>
          <noscript>
            <p className="form-error">Ative o JavaScript para consultar seu pedido ou use a consulta externa da transportadora.</p>
          </noscript>
        </div>
      </main>
      <footer className="tracking-footer">
        <span>AquaBlast · Diversão que aproxima.</span>
        <Link href="/">Voltar à loja</Link>
      </footer>
    </div>
  );
}
