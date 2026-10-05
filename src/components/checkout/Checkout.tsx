"use client";

import { Check, CreditCard, Mail, MapPin, Phone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Selection } from "@/lib/checkout/own/catalog";
import { maskCEP, maskCPF, maskPhone, money, validMobile } from "@/lib/checkout/own/masks";
import type { Quote } from "@/lib/checkout/own/pricing";
import type { Theme } from "@/lib/checkout/own/theme";
import { themeVars } from "@/lib/checkout/own/theme";
import { readAdIds } from "@/lib/tracking-ads/capture";
import { isApiFail, postCart, postOpened, type CartPayload, type CartStep, type CartTrackingInput } from "./api";
import { Campaign } from "./Campaign";
import { ColorPick } from "./ColorPick";
import { ConsentBanner, readStored } from "./ConsentBanner";
import { loadClarity } from "./clarity";
import { BadFieldContext, ErrorBox, fullName, UFS } from "./Field";
import { ErrorDialog } from "./ErrorDialog";
import { dadosProblem, emailOk, serverProblem } from "./explain";
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
  selection: initialSelection,
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
  deliveryPromise = null,
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
  /** Aviso de entrega com data limite, decidido no servidor (lib/site/delivery-promise.ts); null depois da data. */
  deliveryPromise?: string | null;
}) {
  const router = useRouter();
  // A cor pode ser trocada aqui (ColorPick); a seleção da URL/carrinho é só o ponto de partida.
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [cartToken, setCartToken] = useState<string | undefined>(initial?.cartToken);
  const [step, setStep] = useState(initial ? STEP_OF[initial.step] : 1);
  const [data, setData] = useState<FormData>(initial ? { ...initial.customer, ...initial.address } : EMPTY);
  const [bump, setBump] = useState(initial?.bump ?? false);
  // Cor da 2ª unidade do bump: nunca pré-escolhida; desmarcar o bump limpa. Sem ela o pagamento fica bloqueado.
  const [bumpColor, setBumpColor] = useState<Color | null>(initial?.bump ? (initial.bumpColor ?? null) : null);
  // Prioriza o Pix disponível; a alternativa do cartão continua acessível no acordeão.
  const [method, setMethod] = useState<PayMethodUi>(methods.includes("pix") ? "pix" : (methods[0] ?? "card"));
  const [quotes, setQuotes] = useState(quotesInitial);
  const [coupon, setCoupon] = useState(initialCoupon);
  const [couponBusy, setCouponBusy] = useState(false);
  const [paymentSync, setPaymentSync] = useState<"idle" | "saving" | "error">("idle");
  const paymentSyncVersion = useRef(0);
  const quoteVersion = useRef(0);
  // Gravações do carrinho em fila: o blur do celular (salvamento parcial) e o clique em CONTINUAR saem quase juntos;
  // sem fila os dois iriam sem token e nasceriam 2 carrinhos. `tokenRef` leva o token da 1ª para a 2ª.
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const tokenRef = useRef<string | undefined>(initial?.cartToken);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  // Popup do erro (pedido do dono 2026-10-02) e o campo marcado em vermelho; o foco vai ao campo quando o popup fecha.
  const [popup, setPopup] = useState<{ title: string; message: string; sel?: string } | null>(null);
  const [badField, setBadField] = useState<FieldKey | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
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

  // Clarity (mapas de calor) só com consentimento; com `ads.consentRequired` desligado o banner já decide "sim".
  useEffect(() => {
    if (consent) loadClarity();
  }, [consent]);

  const buildTracking = useCallback((): CartTrackingInput | undefined => {
    if (consent === null) return undefined;
    if (!consent) return { consent: false };
    try {
      return { consent: true, ...readAdIds() };
    } catch {
      return { consent: true };
    }
  }, [consent]);

  function saveCart(...args: Parameters<typeof saveCartNow>): ReturnType<typeof saveCartNow> {
    const run = saveQueue.current.then(() => saveCartNow(...args));
    saveQueue.current = run.catch(() => undefined);
    return run;
  }

  async function saveCartNow(targetStep: CartStep, bumpValue: boolean, opts: { customer?: boolean; address?: boolean; lead?: CartPayload["lead"]; selection?: Selection } = {}, bumpColorValue: Color | null = bumpColor) {
    const sel = opts.selection ?? selection;
    const version = ++quoteVersion.current;
    const payload: CartPayload = {
      token: tokenRef.current ?? cartToken ?? readTokenFromStorage(),
      selection: { pack: sel.pack, colors: sel.colors },
      step: targetStep,
      bump: bumpValue,
      ...(bumpValue && bumpColorValue ? { bumpColor: bumpColorValue } : {}),
      tracking: buildTracking(),
      ...(coupon ? { coupon } : {}),
      ...(visitId.current ? { visit: visitId.current } : {}),
    };
    if (opts.lead) payload.lead = opts.lead;
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
    tokenRef.current = result.token;
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
    if (key === badField) setBadField(null);
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

  function fail(msg: string, sel?: string, title = "Confira os dados") {
    setError(msg);
    const m = sel ? /^\[name=([a-z]+)\]$/.exec(sel) : null;
    setBadField(m ? (m[1] as FieldKey) : null);
    setPopup({ title, message: msg, sel });
  }

  function closePopup() {
    const sel = popup?.sel;
    setPopup(null);
    if (sel) panel.current?.querySelector<HTMLElement>(sel)?.focus();
  }

  /** Recusa do servidor: o campo vem como caminho (`customer.phone`), que não é seletor; vira `[name=phone]` e texto claro. */
  function failServer(result: { error: string; field?: string }) {
    const p = serverProblem(result.error, result.field);
    fail(p.message, p.field ? `[name=${p.field}]` : undefined, p.title);
  }

  /** Envio do CONTINUAR: marca o botão como ocupado na hora e o libera sempre (`finally`), com sucesso, recusa ou erro. */
  async function send<T>(run: () => Promise<T>): Promise<T> {
    sending.current = true;
    setBusy(true);
    try {
      return await run();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function next(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // `sending` fecha a porta na hora (um toque = um envio), sem esperar o React redesenhar com `busy`.
    if (busy || sending.current || couponBusy) return;
    if (step === 1) {
      const problem = dadosProblem(data, !!cpfMasked);
      if (problem) return fail(problem.message, `[name=${problem.field}]`, problem.title);
      // Destinatário começa com o nome da etapa 1 (e acompanha o nome enquanto o cliente não o trocar).
      const name = data.name.trim().replace(/\s+/g, " ");
      if (!data.recipient || data.recipient === autoRecipient.current) {
        autoRecipient.current = name;
        setData((p) => ({ ...p, recipient: name }));
      }
      setError("");
      const result = await send(() => saveCart("entrega", bump, { customer: true }));
      if (isApiFail(result)) return failServer(result);
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!/^\d{8}$/.test(data.cep.replace(/\D/g, ""))) return fail("Informe um CEP com 8 dígitos.", "[name=cep]", "Confira o endereço");
      if (cepState === "loading") return fail("Aguarde um instante: estamos buscando o seu CEP.", undefined, "Só um instante");
      if (!addrOk) {
        if (!data.street.trim()) return fail("Informe o endereço (rua ou avenida).", "[name=street]", "Confira o endereço");
        if (!data.number.trim()) return fail("Informe o número. Se não houver, escreva S/N.", "[name=number]", "Confira o endereço");
        if (!data.district.trim()) return fail("Informe o bairro.", "[name=district]", "Confira o endereço");
        if (!data.city.trim()) return fail("Informe a cidade.", "[name=city]", "Confira o endereço");
        if (!UFS.includes(data.state)) return fail("Selecione o estado.", ".state-select", "Confira o endereço");
        if (!fullName(data.recipient)) return fail("Informe o nome de quem vai receber (nome e sobrenome).", "[name=recipient]", "Confira o endereço");
        setError("");
        focusNext.current = ".ship-options input[type=radio]";
        setAddrOk(true);
        return;
      }
      setError("");
      const result = await send(() => saveCart("pagamento", bump, { customer: true, address: true }));
      if (isApiFail(result)) return failServer(result);
      setStep(3);
    }
  }

  // Salvamento parcial ao sair do e-mail ou do celular: só os campos já válidos. Com e-mail OU celular o servidor grava
  // o contato e manda AddPaymentInfo, mesmo que a pessoa abandone aqui. Inválido/vazio = não salva.
  function handleContactBlur() {
    if (consent === null || couponBusy) return; // salvamento parcial só depois de responder ao consentimento.
    const email = emailOk(data.email) ? data.email.trim() : undefined;
    const phone = validMobile(data.phone) ? data.phone : undefined;
    if (!email && !phone) return;
    const name = fullName(data.name) && data.name.trim().length >= 3 ? data.name.trim() : undefined;
    void saveCart("dados", bump, { lead: { ...(name ? { name } : {}), ...(email ? { email } : {}), ...(phone ? { phone } : {}) } });
  }

  // Troca de cor (etapas 1 e 2): atualiza a tela, a URL (recarregar mantém) e, se o carrinho já existe, grava nele.
  function handleColorChange(index: 0 | 1, color: Color) {
    const [first, second] = selection.colors;
    const colors: Color[] = selection.pack === "kit" ? (index === 0 ? [color, second ?? first] : [first, color]) : [color];
    const next: Selection = { ...selection, colors };
    setSelection(next);
    if (window.location.pathname === "/checkout") {
      const q = new URLSearchParams(window.location.search);
      if (next.pack === "kit") {
        q.set("cor1", colors[0]);
        q.set("cor2", colors[1] ?? colors[0]);
      } else {
        q.set("cor", colors[0]);
      }
      window.history.replaceState(null, "", `?${q.toString()}`);
    }
    if (!tokenRef.current) return;
    void saveCart(step === 2 ? "entrega" : "dados", bump, { selection: next, ...(step === 2 ? { customer: true } : {}) }).then((result) => {
      if (isApiFail(result)) setNotice("Não foi possível salvar a cor agora. Ela vai junto quando você continuar.");
    });
  }

  async function syncPaymentCart(value: boolean, color: Color | null) {
    const version = ++paymentSyncVersion.current;
    setPaymentSync("saving");
    try {
      const result = await saveCart("pagamento", value, { customer: true, address: true }, color);
      if (version !== paymentSyncVersion.current) return;
      setPaymentSync(isApiFail(result) ? "error" : "idle");
    } catch {
      if (version === paymentSyncVersion.current) setPaymentSync("error");
    }
  }

  function handleBumpChange(value: boolean) {
    setBump(value);
    const color = value ? bumpColor : null;
    if (!value) setBumpColor(null);
    setError("");
    setNotice(null);
    void syncPaymentCart(value, color);
  }

  function handleBumpColorChange(color: Color) {
    setBumpColor(color);
    setError("");
    void syncPaymentCart(true, color);
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
      <StepDados data={data} onChange={change} onContactBlur={handleContactBlur} onSubmit={onSubmit} cpfMasked={cpfMasked} busy={busy} buttonLabel={theme.buttonLabel} error={errorBox} />
    ) : n === 2 ? (
      <StepEntrega data={data} onChange={change} onSubmit={onSubmit} cepState={cepState} addrOk={addrOk} busy={busy} buttonLabel={theme.buttonLabel} error={errorBox} />
    ) : cartToken ? (
      <StepPagamento
        paymentSync={paymentSync}
        onRetrySync={() => void syncPaymentCart(bump, bumpColor)}
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
        {!paid && step < 3 ? <ColorPick selection={selection} onChange={handleColorChange} /> : null}
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
                        <fieldset className="ck-step-fields" disabled={couponBusy}>
                          <BadFieldContext.Provider value={badField}>{body(n)}</BadFieldContext.Provider>
                        </fieldset>
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
            deliveryPromise={deliveryPromise}
          />
          <TrustSeals methods={methods} maxInstallments={maxInstallments} />
        </div>
      </main>
      <Footer theme={theme} year={year} methods={methods} maxInstallments={maxInstallments} support={support} />
      {popup ? <ErrorDialog title={popup.title} message={popup.message} onClose={closePopup} /> : null}
      {paid ? null : <ConsentBanner requireConsent={consentRequired} onDecide={setConsent} />}
    </div>
  );
}
