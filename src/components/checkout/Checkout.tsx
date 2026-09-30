"use client";

import { Check, CreditCard, Mail, MapPin, Phone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Selection } from "@/lib/checkout/own/catalog";
import { maskCEP, maskCPF, maskPhone, money, validCPF, validMobile } from "@/lib/checkout/own/masks";
import type { Quote } from "@/lib/checkout/own/pricing";
import type { Theme } from "@/lib/checkout/own/theme";
import { themeVars } from "@/lib/checkout/own/theme";
import { readAdIds } from "@/lib/tracking-ads/capture";
import { isApiFail, postCart, postOpened, type CartPayload, type CartStep, type CartTrackingInput } from "./api";
import { Campaign } from "./Campaign";
import { ConsentBanner, readStored } from "./ConsentBanner";
import { ErrorBox, fullName, UFS } from "./Field";
import { Footer } from "./Footer";
import { colorName, OrderSummary, type PayView } from "./OrderSummary";
import { PixLogo } from "./PixLogo";
import { ShipBar } from "./ShipBar";
import { StepDados } from "./StepDados";
import { StepEntrega } from "./StepEntrega";
import { StepPagamento } from "./StepPagamento";
import { SuccessView } from "./SuccessView";
import { TopBar } from "./TopBar";
import { TrustSeals } from "./TrustSeals";
import type { Color } from "@/lib/site/types";
import type { CepState, CheckoutInitial, FieldKey, FormData, PaidInfo, PayMethodUi, StepName } from "./types";

const TOKEN_KEY = "ck-cart-token";
const STEP_NAMES = ["Seus dados", "Entrega", "Pagamento"] as const;
const STEP_OF: Record<StepName, number> = { dados: 1, entrega: 2, pagamento: 3 };
const EMPTY: FormData = { name: "", email: "", phone: "", cpf: "", cep: "", street: "", number: "", extra: "", district: "", city: "", state: "", recipient: "" };
const ADDRESS_KEYS: FieldKey[] = ["cep", "street", "number", "extra", "district", "city", "state", "recipient"];

type ViaCep = { erro?: unknown; logradouro?: unknown; bairro?: unknown; localidade?: unknown; uf?: unknown };
const clean = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Única chamada externa do checkout: só o CEP vai para o ViaCEP (sem cookies nem referer). Qualquer falha vira preenchimento manual. */
async function fetchCep(cep: string, signal: AbortSignal): Promise<ViaCep | null> {
  const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
  if (!r.ok) return null;
  const j = (await r.json()) as ViaCep;
  return j && typeof j === "object" && !j.erro ? j : null;
}

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
 * Checkout próprio (plano 8.6/8.7/9.2), com o MESMO markup, classes, textos, validações e foco da origem
 * (app/checkout.tsx do projeto aquablast-checkout). O que muda em relação à origem, e por quê:
 * - valores, cores, fotos e nomes vêm do servidor (`quotes`, seleção da URL); Pix e cartão têm preços próprios;
 * - cada etapa concluída é salva no servidor (POST /api/checkout/cart): e-mail no blur → "dados", etapa 1 →
 *   "entrega", etapa 2 → "pagamento" (é esse "pagamento" que dispara o AddPaymentInfo pela API de conversão);
 * - o pagamento é real (gateway do painel); aprovado ou em análise → `/checkout/pedido/<publicToken>`, página
 *   durável que mostra este mesmo componente com `paid` (SuccessView + etapas concluídas, sem EDITAR);
 * - `ConsentBanner`: nenhum identificador de anúncio é lido nem enviado antes da resposta (plano 9.2); o
 *   rastreamento do checkout é todo pelo servidor (CAPI + GA4 MP), sem GTM/dataLayer/pixel no navegador;
 * - `initial` (plano 8.8): carrinho retomado. O CPF chega só mascarado e não é reenviado se ficar vazio.
 * `cartToken` mora só no `localStorage` deste navegador.
 */
export function Checkout({
  theme,
  selection,
  methods,
  maxInstallments,
  pixTtlSeconds,
  bumpEnabled,
  pixGateway,
  cardGateway,
  cardPublicConfig,
  cardPending = false,
  quotesInitial,
  coupon: initialCoupon = "",
  support,
  consentRequired = true,
  initial,
  paid,
}: {
  theme: Theme;
  selection: Selection;
  methods: PayMethodUi[];
  maxInstallments: number;
  pixTtlSeconds: number;
  bumpEnabled: boolean;
  pixGateway: string | null;
  cardGateway: string | null;
  cardPublicConfig: Record<string, string>;
  /** Cartão aparece com as parcelas, mas ainda sem gateway: a etapa 3 abre no Pix e o cartão só avisa. */
  cardPending?: boolean;
  quotesInitial: { pix: Quote; card: Quote };
  /** Cupom de teste da URL (`?cupom=`): vai junto em cada POST; o valor sai sempre do servidor. */
  coupon?: string;
  support: { href: string; external: boolean };
  /** `ads.consentRequired` do painel. Desligado: sem banner, identificadores de anúncio lidos sempre. */
  consentRequired?: boolean;
  initial?: CheckoutInitial;
  paid?: PaidInfo;
}) {
  const router = useRouter();
  const [cartToken, setCartToken] = useState<string | undefined>(initial?.cartToken);
  const [step, setStep] = useState(initial ? STEP_OF[initial.step] : 1);
  const [data, setData] = useState<FormData>(initial ? { ...initial.customer, ...initial.address } : EMPTY);
  const [bump, setBump] = useState(initial?.bump ?? false);
  // Cor da 2ª unidade do bump: nunca pré-escolhida; desmarcar o bump limpa. Sem ela o pagamento fica bloqueado.
  const [bumpColor, setBumpColor] = useState<Color | null>(initial?.bump ? (initial.bumpColor ?? null) : null);
  // Mantém a seleção inicial da etapa de pagamento; nas etapas anteriores, o resumo destaca o Pix.
  // Cartão aguardando gateway: a etapa 3 abre no Pix (única forma que cobra).
  const [method, setMethod] = useState<PayMethodUi>(methods.includes("card") && !cardPending ? "card" : methods.includes("pix") ? "pix" : (methods[0] ?? "pix"));
  const [quotes, setQuotes] = useState(quotesInitial);
  const [coupon, setCoupon] = useState(initialCoupon);
  const [couponBusy, setCouponBusy] = useState(false);
  const quoteVersion = useRef(0);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cepState, setCepState] = useState<CepState>(initial?.address.street && initial.address.city ? "found" : "idle");
  const [addrOk, setAddrOk] = useState(initial?.step === "pagamento");
  const [year] = useState(() => new Date().getFullYear());
  const cpfMasked = initial?.cpfMasked ?? null;

  const panel = useRef<HTMLDivElement>(null);
  const cepReq = useRef<AbortController | null>(null);
  const focusNext = useRef("");
  const autoRecipient = useRef("");

  const canBump = bumpEnabled && selection.pack === "unit";
  const hasBump = canBump && bump;

  // Leva o cliente ao primeiro campo da etapa; no celular só a partir da etapa 2, para não abrir o teclado ao carregar. Na etapa 3 o foco vai para o título.
  useEffect(() => {
    if (paid) return;
    const el = panel.current;
    if (!el) return;
    if (step === 3) {
      el.parentElement?.querySelector<HTMLElement>("h3")?.focus();
      return;
    }
    if (step === 1 && !window.matchMedia("(min-width: 1001px)").matches) return;
    el.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: step === 1 });
  }, [step, paid]);
  // Foco pedido por uma ação (CEP encontrado → Número; endereço confirmado → frete; cartão aberto com o mouse → número do cartão).
  useEffect(() => {
    const sel = focusNext.current;
    if (!sel) return;
    focusNext.current = "";
    panel.current?.querySelector<HTMLElement>(sel)?.focus();
  }, [cepState, addrOk, method]);
  useEffect(() => () => cepReq.current?.abort(), []);
  // Aviso "checkout aberto" para a equipe (2026-09-30). Uma vez por aba (id de visita no sessionStorage); o
  // servidor ainda limita por visita e por IP. Não roda na tela de pedido já pago.
  const openedSent = useRef(false);
  const visitId = useRef("");
  useEffect(() => {
    if (paid || openedSent.current) return;
    openedSent.current = true;
    let visit = "";
    try {
      visit = sessionStorage.getItem("aqb-ck-visit") ?? "";
      if (!visit) {
        visit = crypto.randomUUID();
        sessionStorage.setItem("aqb-ck-visit", visit);
      }
    } catch {
      visit = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "";
    }
    if (!visit) return;
    visitId.current = visit;
    // Resposta do banner já salva numa visita anterior; sem ela o servidor segue `ads.consentRequired`.
    const stored = readStored();
    const q = new URLSearchParams(window.location.search);
    const source = q.get("utm_source")?.slice(0, 80);
    const campaign = q.get("utm_campaign")?.slice(0, 120);
    postOpened({
      visit,
      selection: { pack: selection.pack, colors: selection.colors },
      ...(initialCoupon ? { coupon: initialCoupon } : {}),
      ...(source ? { source } : {}),
      ...(campaign ? { campaign } : {}),
      ...(stored ? { consent: stored === "accepted" } : {}),
    });
  }, [paid, selection.pack, selection.colors, initialCoupon]);

  const buildTracking = useCallback((): CartTrackingInput | undefined => {
    if (consent === null) return undefined;
    if (!consent) return { consent: false };
    try {
      return { consent: true, ...readAdIds() };
    } catch {
      return { consent: true };
    }
  }, [consent]);

  async function saveCart(targetStep: CartStep, bumpValue: boolean, opts: { customer?: boolean; address?: boolean } = {}, bumpColorValue: Color | null = bumpColor) {
    const version = ++quoteVersion.current;
    const payload: CartPayload = {
      token: cartToken ?? readTokenFromStorage(),
      selection: { pack: selection.pack, colors: selection.colors },
      step: targetStep,
      bump: bumpValue,
      ...(bumpValue && bumpColorValue ? { bumpColor: bumpColorValue } : {}),
      tracking: buildTracking(),
      ...(coupon ? { coupon } : {}),
      ...(visitId.current ? { visit: visitId.current } : {}),
    };
    if (opts.customer && (data.name || data.email || data.phone || data.cpf)) {
      // Carrinho retomado com CPF vazio: não reenvia o campo — o servidor mantém o CPF cifrado gravado.
      const base = { name: data.name.trim(), email: data.email.trim(), phone: data.phone };
      payload.customer = cpfMasked && data.cpf === "" ? base : { ...base, cpf: data.cpf };
    }
    if (opts.address && (data.street || data.cep)) {
      payload.address = {
        cep: data.cep,
        street: data.street.trim(),
        number: data.number.trim(),
        extra: data.extra.trim() || undefined,
        district: data.district.trim(),
        city: data.city.trim(),
        state: data.state,
        recipient: data.recipient.trim(),
      };
    }
    const result = await postCart(payload);
    if (isApiFail(result)) return result;
    setCartToken(result.token);
    writeTokenToStorage(result.token);
    if (version === quoteVersion.current) setQuotes(result.quotes);
    return result;
  }

  async function applyCoupon(code: string): Promise<string | null> {
    const version = ++quoteVersion.current;
    setCouponBusy(true);
    try {
      const response = await fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pack: selection.pack, bump: hasBump, coupon: code }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) return result.error || "Não foi possível aplicar o cupom.";
      if (version !== quoteVersion.current) return "Seu pedido mudou. Aplique o cupom novamente.";
      setCoupon(code);
      setQuotes(result.quotes);
      return null;
    } catch {
      return "Não foi possível validar o cupom. Tente novamente.";
    } finally {
      setCouponBusy(false);
    }
  }

  async function lookupCep(cep: string) {
    cepReq.current?.abort();
    const ctl = new AbortController();
    cepReq.current = ctl;
    const timer = setTimeout(() => ctl.abort(), 5000);
    setCepState("loading");
    let j: ViaCep | null = null;
    try {
      j = await fetchCep(cep, ctl.signal);
    } catch {
      j = null;
    } finally {
      clearTimeout(timer);
    }
    if (cepReq.current !== ctl) return;
    cepReq.current = null;
    const street = clean(j?.logradouro),
      district = clean(j?.bairro),
      city = clean(j?.localidade),
      uf = clean(j?.uf, 2).toUpperCase(),
      hasUf = UFS.includes(uf);
    if (street && city && hasUf) {
      setData((p) => ({ ...p, street, district, city, state: uf }));
      focusNext.current = "input[name=number]";
      setCepState("found");
      return;
    }
    // CEP não encontrado, rede fora ou CEP geral da cidade (sem rua): libera tudo para preenchimento manual, aproveitando cidade/UF se vierem.
    setData((p) => ({ ...p, city: city || p.city, state: hasUf ? uf : p.state }));
    focusNext.current = "input[name=street]";
    setCepState("manual");
  }

  function change(key: FieldKey, value: string) {
    const masked = key === "phone" ? maskPhone(value) : key === "cpf" ? maskCPF(value) : key === "cep" ? maskCEP(value) : value;
    setData((p) => ({ ...p, [key]: masked }));
    setError("");
    if (ADDRESS_KEYS.includes(key)) setAddrOk(false);
    if (key === "cep") {
      const d = masked.replace(/\D/g, "");
      if (d.length === 8) {
        if (d !== data.cep.replace(/\D/g, "")) void lookupCep(d);
      } else {
        const c = cepReq.current;
        cepReq.current = null;
        c?.abort();
        setCepState("idle");
      }
    }
  }

  function goTo(n: number) {
    setStep(n);
    setError("");
  }

  function fail(msg: string, sel?: string) {
    setError(msg);
    if (sel) panel.current?.querySelector<HTMLElement>(sel)?.focus();
  }

  async function next(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || couponBusy) return;
    if (step === 1) {
      if (!fullName(data.name)) return fail("Informe seu nome completo.", "[name=name]");
      if (!validCPF(data.cpf) && !(cpfMasked && data.cpf === "")) return fail("Confira o CPF informado.", "[name=cpf]");
      if (!validMobile(data.phone)) return fail("Informe um celular válido com DDD: (00) 00000-0000.", "[name=phone]");
      // Destinatário começa com o nome da etapa 1 (e acompanha o nome enquanto o cliente não o trocar).
      const name = data.name.trim().replace(/\s+/g, " ");
      if (!data.recipient || data.recipient === autoRecipient.current) {
        autoRecipient.current = name;
        setData((p) => ({ ...p, recipient: name }));
      }
      setError("");
      setBusy(true);
      const result = await saveCart("entrega", bump, { customer: true });
      setBusy(false);
      if (isApiFail(result)) return fail(result.error, result.field ? `[name=${result.field}]` : undefined);
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!/^\d{8}$/.test(data.cep.replace(/\D/g, ""))) return fail("Informe um CEP com 8 dígitos.", "[name=cep]");
      if (cepState === "loading") return fail("Aguarde um instante: estamos buscando o seu CEP.");
      if (!addrOk) {
        if (!data.street.trim()) return fail("Informe o endereço (rua ou avenida).", "[name=street]");
        if (!data.number.trim()) return fail("Informe o número. Se não houver, escreva S/N.", "[name=number]");
        if (!data.district.trim()) return fail("Informe o bairro.", "[name=district]");
        if (!data.city.trim()) return fail("Informe a cidade.", "[name=city]");
        if (!UFS.includes(data.state)) return fail("Selecione o estado.", ".state-select");
        if (!fullName(data.recipient)) return fail("Informe o nome de quem vai receber (nome e sobrenome).", "[name=recipient]");
        setError("");
        focusNext.current = ".ship-options input[type=radio]";
        setAddrOk(true);
        return;
      }
      setError("");
      setBusy(true);
      const result = await saveCart("pagamento", bump, { customer: true, address: true });
      setBusy(false);
      if (isApiFail(result)) return fail(result.error, result.field ? `[name=${result.field}]` : undefined);
      setStep(3);
    }
  }

  function handleEmailBlur() {
    if (consent === null || couponBusy) return; // salvamento parcial só depois de responder ao consentimento.
    void saveCart("dados", bump, { customer: true });
  }

  function handleBumpChange(value: boolean) {
    setBump(value);
    const color = value ? bumpColor : null;
    if (!value) setBumpColor(null);
    setError("");
    setNotice(null);
    void saveCart("pagamento", value, { customer: true, address: true }, color).then((result) => {
      if (isApiFail(result)) setNotice("Não foi possível atualizar o total agora. Os valores abaixo podem estar desatualizados.");
    });
  }

  function handleBumpColorChange(color: Color) {
    setBumpColor(color);
    setError("");
    void saveCart("pagamento", true, { customer: true, address: true }, color).then((result) => {
      if (isApiFail(result)) setNotice("Não foi possível salvar a cor agora. Ela vai junto quando você finalizar a compra.");
    });
  }

  function handleMethodChange(m: PayMethodUi, byPointer: boolean) {
    if (byPointer && m === "card" && !cardPending) focusNext.current = "input[name=cc-number]";
    setMethod(m);
    setError("");
  }

  const goToOrder = useCallback((publicToken: string) => router.push(`/checkout/pedido/${publicToken}`), [router]);

  // Valores da confirmação (pedido pago), no formato da origem.
  const [c1, c2] = selection.colors;
  const paidKit = selection.pack === "kit" || (paid ? bump : hasBump);
  const items =
    selection.pack === "kit"
      ? [`Kit com 2 AquaBlast (1 ${colorName(c1)} + 1 ${colorName(c2 ?? c1)})`]
      : paidKit
        ? [`1 AquaBlast ${colorName(c1)}`, `+ 1 AquaBlast ${colorName(bumpColor ?? c1)} (oferta do kit)`]
        : [`1 AquaBlast ${colorName(c1)}`];
  const address = `${data.street}, ${data.number}${data.extra ? ` · ${data.extra}` : ""} · ${data.district} · ${data.city}/${data.state} · CEP ${data.cep}`;
  const paidPer = paid ? Math.round(paid.amountCents / Math.max(1, paid.installments)) : 0;
  const payment = paid
    ? paid.method === "card"
      ? `Cartão ${paid.cardBrand ?? ""} final ${paid.cardLast4 ?? ""} em ${paid.installments}x de ${money(paidPer)} sem juros`.replace(/\s+/g, " ")
      : "Pix"
    : "";
  const restartHref = selection.pack === "kit" ? `/checkout?pack=kit&cor1=${c1}&cor2=${c2 ?? c1}` : `/checkout?pack=unit&cor=${c1}`;
  const payView: PayView = paid ? paid.method : step === 3 && methods.length > 0 ? method : "preview";

  const doneCard = (i: number) =>
    i === 0 ? (
      <>
        <strong className="ck-done-title">{data.name}</strong>
        <span>
          <Mail size={15} aria-hidden="true" />
          {data.email}
        </span>
        <span>
          <Phone size={15} aria-hidden="true" />
          {data.phone}
        </span>
      </>
    ) : i === 1 ? (
      <>
        <strong className="ck-done-title">
          <MapPin size={17} aria-hidden="true" />
          {data.street}, {data.number}
          {data.extra && ` - ${data.extra}`}
        </strong>
        <span>
          {data.city} - {data.state} | <span className="ck-nw">CEP: {data.cep}</span>
        </span>
        <em className="ck-ship-tag">{theme.badgeText}</em>
      </>
    ) : (
      <>
        <strong className="ck-done-title">
          {paid?.method === "card" ? (
            <>
              <CreditCard size={17} aria-hidden="true" />
              Cartão final {paid.cardLast4}
            </>
          ) : (
            <>
              <PixLogo size={17} />
              Pix
            </>
          )}
        </strong>
        <span>{paid?.method === "card" ? `${paid.installments}x de ${money(paidPer)} sem juros` : `${money(paid?.amountCents ?? quotes.pix.amountCents)} à vista`}</span>
      </>
    );

  const errorBox = error ? <ErrorBox>{error}</ErrorBox> : null;
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => void next(e);

  const body = (n: number) =>
    n === 1 ? (
      <StepDados data={data} onChange={change} onEmailBlur={handleEmailBlur} onSubmit={onSubmit} cpfMasked={cpfMasked} busy={busy} buttonLabel={theme.buttonLabel} error={errorBox} />
    ) : n === 2 ? (
      <StepEntrega data={data} onChange={change} onSubmit={onSubmit} cepState={cepState} addrOk={addrOk} busy={busy} buttonLabel={theme.buttonLabel} error={errorBox} />
    ) : cartToken ? (
      <StepPagamento
        cartToken={cartToken}
        color={c1}
        canBump={canBump}
        bump={bump}
        onBumpChange={handleBumpChange}
        bumpColor={bumpColor}
        onBumpColorChange={handleBumpColorChange}
        quotes={quotes}
        coupon={coupon}
        methods={methods}
        method={method}
        onMethodChange={handleMethodChange}
        maxInstallments={maxInstallments}
        pixTtlSeconds={pixTtlSeconds}
        pixGateway={pixGateway}
        cardGateway={cardGateway}
        cardPublicConfig={cardPublicConfig}
        cardPending={cardPending}
        storeName={theme.storeName}
        onPaid={goToOrder}
        onPending={goToOrder}
      />
    ) : (
      <ErrorBox>Não encontramos o seu carrinho. Volte para a etapa de entrega e tente de novo.</ErrorBox>
    );

  return (
    <div className="ck ck-root" style={themeVars(theme)}>
      <ShipBar theme={theme} />
      <TopBar theme={theme} />
      <main className="container ck-main">
        <Campaign theme={theme} selection={selection} bump={paid ? bump : hasBump} bumpColor={bumpColor} />
        {notice ? (
          <div className="notice" role="alert">
            {notice}{" "}
            <button type="button" onClick={() => setNotice(null)}>
              Ok, entendi
            </button>
          </div>
        ) : null}
        <div className="ck-grid">
          <section className="ck-card ck-flow" aria-label="Finalize seu pedido">
            {paid ? (
              <SuccessView
                orderNumber={paid.orderNumber}
                payment={payment}
                items={items}
                total={money(paid.amountCents)}
                address={address}
                email={data.email}
                testMode={paid.testMode}
                restartHref={restartHref}
              />
            ) : null}
            <ol className={`ck-steps${paid ? " is-complete" : ""}`} aria-label="Etapas da compra">
              {STEP_NAMES.map((name, i) => {
                const n = i + 1;
                const state = paid || n < step ? "done" : n === step ? "current" : "todo";
                return (
                  <li key={name} className={`ck-step is-${state}`} aria-current={state === "current" ? "step" : undefined}>
                    <div className="ck-step-head">
                      <span className="ck-dot" aria-hidden="true">
                        {state === "done" ? <Check size={16} strokeWidth={3} /> : n}
                      </span>
                      <h3 tabIndex={state === "current" ? -1 : undefined}>
                        {name}
                        {state === "done" ? <span className="ck-u-sr-only"> (concluída)</span> : null}
                      </h3>
                    </div>
                    {state === "done" ? (
                      <div className="ck-done">
                        <div className="ck-done-info">{doneCard(i)}</div>
                        {!paid ? (
                          <button type="button" className="ck-edit" onClick={() => goTo(n)} aria-label={`Editar ${name.toLowerCase()}`}>
                            EDITAR
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {state === "current" ? (
                      <div className="ck-step-body" ref={panel}>
                        <fieldset className="ck-step-fields" disabled={couponBusy}>{body(n)}</fieldset>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
          <OrderSummary
            selection={selection}
            bump={paid ? bump : hasBump}
            bumpColor={bumpColor}
            quotes={quotes}
            payView={payView}
            cardEnabled={methods.includes("card")}
            pixEnabled={methods.includes("pix")}
            paid={paid ?? null}
            coupon={coupon}
            couponBusy={couponBusy || busy}
            onCouponApply={applyCoupon}
          />
          <TrustSeals methods={methods} maxInstallments={maxInstallments} />
        </div>
      </main>
      <Footer theme={theme} year={year} methods={methods} maxInstallments={maxInstallments} support={support} />
      {paid ? null : <ConsentBanner requireConsent={consentRequired} onDecide={setConsent} />}
    </div>
  );
}
