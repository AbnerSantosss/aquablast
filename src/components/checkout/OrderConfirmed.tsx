import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Check, Headset, Lock, Mail, PackageCheck, PackageSearch, ShieldCheck, Truck, type LucideIcon } from "lucide-react";
import type { OrderStatus } from "@/db/schema";
import { themeVars, type Theme } from "@/lib/checkout/own/theme";
import { RETURNS_PATH } from "@/lib/site/constants";
import { TestModeNote } from "./PaySeals";
import { Brand } from "./TopBar";

type StepState = "done" | "todo";

interface Step {
  icon: LucideIcon;
  title: string;
  /** Texto abaixo do título: [quando concluída, quando ainda não]. */
  detail: [string, string];
}

const STEPS: Step[] = [
  { icon: PackageSearch, title: "Pedido realizado", detail: ["Concluído", "Próxima etapa"] },
  { icon: BadgeCheck, title: "Compra aprovada", detail: ["Pagamento confirmado", "Próxima etapa"] },
  { icon: Truck, title: "Pedido enviado", detail: ["Enviado", "Aguardando envio"] },
  { icon: PackageCheck, title: "Saiu para entrega", detail: ["A caminho", "Próxima etapa"] },
  { icon: Check, title: "Pedido entregue", detail: ["Entregue", "Próxima etapa"] },
];

/**
 * Quantas etapas já estão concluídas. A tela só aparece com o pagamento aprovado, então o mínimo é 2;
 * daí em diante segue o status real do pedido — `exception` e `cancelled` não avançam nada.
 */
/** Resumo da compra, já formatado no servidor (page.tsx). */
export interface OrderSummary {
  items: string[];
  payment: string;
  total: string;
  address: string;
  email: string | null;
}

/** Canal de suporte: WhatsApp cadastrado no painel ou, sem ele, o e-mail de contato. Nunca um número inventado. */
export interface SupportLink {
  href: string;
  /** Abre em outra aba (WhatsApp); `mailto:` não. */
  external: boolean;
}

function stepsDone(status: OrderStatus): number {
  if (status === "delivered") return 5;
  if (status === "out_for_delivery") return 4;
  if (status === "shipped" || status === "in_transit") return 3;
  return 2;
}

/**
 * Tela de compra confirmada (layout do dono, 2026-09-28). É o ramo "pago" de /checkout/pedido/[token]:
 * fica no grupo (checkout), sem rastreamento no navegador, porque a URL carrega o token do pedido.
 * O aviso de modo de teste só aparece com o gateway `simulado`.
 */
export function OrderConfirmed({
  theme,
  orderNumber,
  status,
  testMode,
  firstName,
  summary,
  support,
  year,
}: {
  theme: Theme;
  orderNumber: string;
  status: OrderStatus;
  testMode: boolean;
  /** Primeiro nome do cliente; sem nome gravado o título fica sem ele. */
  firstName: string | null;
  summary: OrderSummary;
  support: SupportLink;
  year: number;
}) {
  const done = stepsDone(status);
  return (
    <div className="ck ck-root oc" style={themeVars(theme)}>
      <header className="oc-top">
        <div className="oc-wrap oc-top-in">
          <Brand storeName={theme.storeName} />
          <p className="oc-safe">
            <Lock size={18} aria-hidden="true" />
            Conexão protegida
          </p>
        </div>
      </header>
      <main className="oc-wrap oc-main">
        <section className="oc-card oc-hero" aria-labelledby="oc-title">
          <div className="oc-hero-copy">
            <span className="oc-hero-check" aria-hidden="true">
              <Check size={20} strokeWidth={3.5} />
            </span>
            <div>
              <p className="oc-approved">Pagamento aprovado</p>
              <h1 id="oc-title">{firstName ? `Obrigado pela sua compra, ${firstName}!` : "Obrigado pela sua compra!"}</h1>
              <p className="oc-lead">Deu tudo certo. Recebemos o seu pedido!</p>
              <p className="oc-order">
                Pedido nº <strong>{orderNumber}</strong>
              </p>
            </div>
          </div>
          <div className="oc-hero-photo">
            <Image src="/familia-brasileira.webp" alt="Família brincando com lançadores AquaBlast no jardim" fill sizes="(max-width: 760px) 100vw, 520px" priority />
          </div>
        </section>
        {testMode ? <TestModeNote /> : null}
        <section className="oc-card oc-next" aria-labelledby="oc-next-title">
          <h2 id="oc-next-title">O que acontece agora</h2>
          <ol className="oc-steps">
            {STEPS.map((step, i) => {
              const state: StepState = i < done ? "done" : "todo";
              const Icon = step.icon;
              return (
                <li key={step.title} className={`oc-step is-${state}${i === done - 1 ? " is-current" : ""}`} aria-current={i === done - 1 ? "step" : undefined}>
                  <span className="oc-step-dot" aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <span className="oc-step-text">
                    <strong>{step.title}</strong>
                    <small>{step.detail[state === "done" ? 0 : 1]}</small>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="oc-mail">
            <span className="oc-mail-icon" aria-hidden="true">
              <Mail size={30} />
            </span>
            <div>
              <h3>Você receberá as próximas atualizações por e-mail</h3>
              <p>Assim que o pedido for enviado, o código de rastreamento chegará ao e-mail informado na compra.</p>
              <small>Confira também a caixa de spam.</small>
            </div>
          </div>
        </section>
        <section className="oc-card oc-summary" aria-labelledby="oc-summary-title">
          <h2 id="oc-summary-title">Resumo da sua compra</h2>
          <dl className="oc-summary-list">
            <div>
              <dt>Itens</dt>
              <dd>
                {summary.items.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Pagamento</dt>
              <dd>{summary.payment}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>
                <strong>{summary.total}</strong>
              </dd>
            </div>
            <div>
              <dt>Entrega</dt>
              <dd>{summary.address}</dd>
            </div>
            {summary.email ? (
              <div>
                <dt>Confirmação</dt>
                <dd>
                  Enviamos a confirmação para <strong>{summary.email}</strong>
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
        <div className="oc-actions">
          <Link className="oc-back" href="/">
            <ArrowLeft size={20} aria-hidden="true" />
            Voltar para a loja
          </Link>
          <a className="oc-support" href={support.href} {...(support.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            <Headset size={20} aria-hidden="true" />
            Falar com o suporte
          </a>
        </div>
        <p className="oc-calm">
          <ShieldCheck size={20} aria-hidden="true" />
          Pode ficar tranquilo. Vamos te avisar a cada etapa.
        </p>
      </main>
      <footer className="oc-footer">
        <div className="oc-wrap oc-footer-in">
          <Brand storeName={theme.storeName} />
          <nav aria-label="Ajuda">
            <Link href="/rastrear">Rastrear pedido</Link>
            <Link href={RETURNS_PATH}>Trocas e devoluções</Link>
            <a href={support.href} {...(support.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              Suporte
            </a>
          </nav>
          <p>{theme.footerText}</p>
          <small>
            © {year} {theme.storeName}
          </small>
        </div>
      </footer>
    </div>
  );
}
