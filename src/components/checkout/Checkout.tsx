"use client";

import { MapPin, User } from "lucide-react";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { Selection } from "@/lib/checkout/own/catalog";
import type { Quote } from "@/lib/checkout/own/pricing";
import type { Theme } from "@/lib/checkout/own/theme";
import { themeVars } from "@/lib/checkout/own/theme";
import { readAdIds } from "@/lib/tracking-ads/capture";
import { isApiFail, postCart, type CartPayload, type CartStep, type CartTrackingInput } from "./api";
import { Campaign } from "./Campaign";
import { ConsentBanner } from "./ConsentBanner";
import { Footer } from "./Footer";
import { OrderSummary } from "./OrderSummary";
import { ShipBar } from "./ShipBar";
import { StepDados } from "./StepDados";
import { StepEntrega } from "./StepEntrega";
import { StepPagamento } from "./StepPagamento";
import { TopBar } from "./TopBar";
import { TrustSeals } from "./TrustSeals";
import type { AddressData, CheckoutInitial, CustomerData, PayMethodUi, StepName } from "./types";

const TOKEN_KEY = "ck-cart-token";
const STEP_ORDER: StepName[] = ["dados", "entrega", "pagamento"];

const EMPTY_CUSTOMER: CustomerData = { name: "", email: "", phone: "", cpf: "" };
const EMPTY_ADDRESS: AddressData = { cep: "", street: "", number: "", extra: "", district: "", city: "", state: "", recipient: "" };

function readTokenFromStorage(): string | undefined {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeTokenToStorage(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage indisponível (navegador privado, bloqueio de site): o carrinho segue só em memória.
  }
}

/**
 * Orquestrador do checkout próprio (plano 8.6/8.7/9.2). Junta tema, etapas (`ck-steps`, timeline vertical
 * com resumo "concluído" + botão Editar) e resumo do pedido. `cartToken` mora só no `localStorage` deste
 * navegador (nunca em cookie/sessão do servidor) e é enviado de volta em cada `POST /api/checkout/cart`.
 *
 * Consentimento (9.2): este componente sempre passa `requireConsent={true}` para o `ConsentBanner` — não
 * existe hoje um campo público (`GET /api/checkout/config`) dizendo se `ads.consentRequired` está
 * desligado no painel, e mostrar o banner sem essa informação nunca inventa nem esconde nada: quem decide
 * de verdade se os identificadores de anúncio são gravados é o servidor (`upsertCart`, que reconsulta
 * `ads.consentRequired` sozinho). Enquanto o consentimento não é respondido (`consent === null`), nenhum
 * identificador de anúncio é lido nem enviado.
 *
 * Pagamento aprovado ou cartão em análise: navega para `/checkout/pedido/<publicToken>` (página durável,
 * lida do banco) em vez de mostrar a confirmação aqui — só o Pix pendente fica nesta tela (QR/polling),
 * porque ainda há algo interativo para fazer ("Gerar novo código").
 *
 * `step` enviado ao servidor é a etapa em que a pessoa ESTÁ depois do salvamento ("parou em", como o
 * painel de carrinhos mostra): e-mail no blur → "dados"; concluiu dados → "entrega"; concluiu entrega →
 * "pagamento". É esse "pagamento" que dispara o AddPaymentInfo no servidor (POST /api/checkout/cart).
 *
 * `initial` (plano 8.8): carrinho retomado pelo link de recuperação. Abre na etapa salva com os dados
 * preenchidos; o CPF chega só mascarado (`cpfMasked`) e não é reenviado enquanto a pessoa não digitar outro.
 */
export function Checkout({
  theme,
  selection,
  methods,
  maxInstallments,
  bumpEnabled,
  pixGateway,
  cardGateway,
  cardPublicConfig,
  quotesInitial,
  initial,
}: {
  theme: Theme;
  selection: Selection;
  methods: PayMethodUi[];
  maxInstallments: number;
  bumpEnabled: boolean;
  pixGateway: string | null;
  cardGateway: string | null;
  cardPublicConfig: Record<string, string>;
  quotesInitial: { pix: Quote; card: Quote };
  initial?: CheckoutInitial;
}) {
  const router = useRouter();
  const [cartToken, setCartToken] = useState<string | undefined>(initial?.cartToken);
  const [step, setStep] = useState<StepName>(initial?.step ?? "dados");
  const [customer, setCustomer] = useState<CustomerData>(initial?.customer ?? EMPTY_CUSTOMER);
  const [address, setAddress] = useState<AddressData>(initial?.address ?? EMPTY_ADDRESS);
  const [bump, setBump] = useState(initial?.bump ?? false);
  const cpfMasked = initial?.cpfMasked ?? null;
  const [method, setMethod] = useState<PayMethodUi>(methods[0] ?? "pix");
  const [quotes, setQuotes] = useState(quotesInitial);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [dadosSubmitting, setDadosSubmitting] = useState(false);
  const [dadosError, setDadosError] = useState<string | null>(null);
  const [entregaSubmitting, setEntregaSubmitting] = useState(false);
  const [entregaError, setEntregaError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const buildTracking = useCallback((): CartTrackingInput | undefined => {
    if (consent === null) return undefined;
    if (!consent) return { consent: false };
    try {
      return { consent: true, ...readAdIds() };
    } catch {
      return { consent: true };
    }
  }, [consent]);

  const saveCart = useCallback(
    async (targetStep: CartStep, bumpValue: boolean, opts: { customer?: boolean; address?: boolean } = {}) => {
      const tokenNow = cartToken ?? readTokenFromStorage();
      const payload: CartPayload = {
        token: tokenNow,
        selection: { pack: selection.pack, colors: selection.colors },
        step: targetStep,
        bump: bumpValue,
        tracking: buildTracking(),
      };
      if (opts.customer && (customer.name || customer.email || customer.phone || customer.cpf)) {
        // Carrinho retomado com CPF vazio: não reenvia o campo — o servidor mantém o CPF cifrado gravado.
        payload.customer = cpfMasked && customer.cpf === "" ? { name: customer.name, email: customer.email, phone: customer.phone } : customer;
      }
      if (opts.address && (address.street || address.cep)) payload.address = address;
      const result = await postCart(payload);
      if (isApiFail(result)) return result;
      setCartToken(result.token);
      writeTokenToStorage(result.token);
      setQuotes(result.quotes);
      return result;
    },
    [cartToken, selection, buildTracking, customer, address, cpfMasked],
  );

  const submitDados = useCallback(async () => {
    setDadosSubmitting(true);
    setDadosError(null);
    const result = await saveCart("entrega", bump, { customer: true });
    setDadosSubmitting(false);
    if (isApiFail(result)) {
      setDadosError(result.error);
      return;
    }
    setStep("entrega");
  }, [saveCart, bump]);

  const handleEmailBlur = useCallback(() => {
    if (consent === null) return; // salvamento parcial (plano 8.7) só depois de o consentimento ser respondido.
    void saveCart("dados", bump, { customer: true });
  }, [saveCart, bump, consent]);

  const submitEntrega = useCallback(async () => {
    setEntregaSubmitting(true);
    setEntregaError(null);
    const result = await saveCart("pagamento", bump, { customer: true, address: true });
    setEntregaSubmitting(false);
    if (isApiFail(result)) {
      setEntregaError(result.error);
      return;
    }
    setStep("pagamento");
  }, [saveCart, bump]);

  const handleBumpChange = useCallback(
    (value: boolean) => {
      setBump(value);
      setNotice(null);
      void saveCart("pagamento", value, { customer: true, address: true }).then((result) => {
        if (isApiFail(result)) setNotice("Não foi possível atualizar o total agora. Os valores abaixo podem estar desatualizados.");
      });
    },
    [saveCart],
  );

  const onPaid = useCallback(
    (_orderNumber: string, publicToken: string) => {
      router.push(`/checkout/pedido/${publicToken}`);
    },
    [router],
  );

  const onPending = useCallback(
    (_message: string | null, _orderNumber: string, publicToken: string) => {
      router.push(`/checkout/pedido/${publicToken}`);
    },
    [router],
  );

  const currentIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="ck ck-root" style={themeVars(theme)}>
      <ShipBar theme={theme} />
      <div className="container">
        <TopBar theme={theme} />
      </div>
      <main className="ck-main">
        <div className="container">
          <Campaign theme={theme} />

          {notice ? (
            <div className="notice">
              <p>
                {notice} <button type="button" onClick={() => setNotice(null)}>Ok, entendi</button>
              </p>
            </div>
          ) : null}

          <div className="ck-grid">
            <section className="ck-card ck-flow">
              <ol className="ck-steps">
                <li className={`ck-step ${currentIndex === 0 ? "is-current" : currentIndex > 0 ? "is-done" : "is-todo"}`}>
                  <div className="ck-step-head">
                    <span className="ck-dot">1</span>
                    <h3>Seus dados</h3>
                  </div>
                  {step === "dados" ? (
                    <StepDados
                      customer={customer}
                      cpfMasked={cpfMasked}
                      onChange={(patch) => setCustomer((c) => ({ ...c, ...patch }))}
                      onEmailBlur={handleEmailBlur}
                      onSubmit={submitDados}
                      submitting={dadosSubmitting}
                      error={dadosError}
                    />
                  ) : currentIndex > 0 ? (
                    <div className="ck-done">
                      <div className="ck-done-info">
                        <span className="ck-done-title">
                          <User aria-hidden="true" size={16} />
                          {customer.name}
                        </span>
                        <span>{customer.email}</span>
                        <span>{customer.phone}</span>
                      </div>
                      <button type="button" className="ck-edit" onClick={() => setStep("dados")}>
                        Editar
                      </button>
                    </div>
                  ) : null}
                </li>

                <li className={`ck-step ${currentIndex === 1 ? "is-current" : currentIndex > 1 ? "is-done" : "is-todo"}`}>
                  <div className="ck-step-head">
                    <span className="ck-dot">2</span>
                    <h3>Entrega</h3>
                    {theme.badgeText ? <span className="ck-badge">{theme.badgeText}</span> : null}
                  </div>
                  {step === "entrega" ? (
                    <StepEntrega
                      address={address}
                      onChange={(patch) => setAddress((a) => ({ ...a, ...patch }))}
                      onSubmit={submitEntrega}
                      submitting={entregaSubmitting}
                      error={entregaError}
                    />
                  ) : currentIndex > 1 ? (
                    <div className="ck-done">
                      <div className="ck-done-info">
                        <span className="ck-done-title">
                          <MapPin aria-hidden="true" size={16} />
                          {address.street}, {address.number}
                        </span>
                        <span>
                          {address.district} · {address.city}/{address.state}
                        </span>
                        <span className="ck-ship-tag">FRETE GRÁTIS</span>
                      </div>
                      <button type="button" className="ck-edit" onClick={() => setStep("entrega")}>
                        Editar
                      </button>
                    </div>
                  ) : null}
                </li>

                <li className={`ck-step ${currentIndex === 2 ? "is-current" : "is-todo"}`}>
                  <div className="ck-step-head">
                    <span className="ck-dot">3</span>
                    <h3>Pagamento</h3>
                  </div>
                  {step === "pagamento" && cartToken ? (
                    <StepPagamento
                      cartToken={cartToken}
                      color={selection.colors[0]}
                      bump={bump}
                      onBumpChange={handleBumpChange}
                      bumpEnabled={bumpEnabled}
                      quotes={quotes}
                      methods={methods}
                      method={method}
                      onMethodChange={setMethod}
                      maxInstallments={maxInstallments}
                      pixGateway={pixGateway}
                      cardGateway={cardGateway}
                      cardPublicConfig={cardPublicConfig}
                      onPaid={onPaid}
                      onPending={onPending}
                    />
                  ) : null}
                </li>
              </ol>
            </section>

            <OrderSummary selection={selection} bump={bump} quotes={quotes} method={method} />
            <TrustSeals />
          </div>
        </div>
      </main>
      <Footer theme={theme} />
      <ConsentBanner requireConsent onDecide={setConsent} />
    </div>
  );
}
