"use client";

import { Check, CreditCard, LockKeyhole, Mail, MapPin, Phone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Selection } from "@/lib/checkout/own/catalog";
import type { BannerMap } from "@/lib/checkout/own/banners";
import { changeAddressCep, fillAddressFromCep } from "@/lib/checkout/own/address-form";
import { maskCEP, maskCPF, maskPhone, money, validMobile } from "@/lib/checkout/own/masks";
import type { Quote } from "@/lib/checkout/own/pricing";
import { shippingLabelOf, type ShippingMethod } from "@/lib/checkout/own/shipping";
import type { Theme } from "@/lib/checkout/own/theme";
import { themeVars } from "@/lib/checkout/own/theme";
import { internoAtivo } from "@/lib/site/interno";
import { readAdIds } from "@/lib/tracking-ads/capture";
import { isApiFail, postCart, postOpened, type CartPayload, type CartStep, type CartTrackingInput } from "./api";
import { Campaign } from "./Campaign";
import { CheckoutProgress } from "./CheckoutProgress";
import { CheckoutReviews, type CheckoutReview } from "./CheckoutReviews";
import { ColorPick } from "./ColorPick";
import { ConsentBanner, readStored } from "./ConsentBanner";
import { loadClarity } from "./clarity";
import { BadFieldContext, ErrorBox, fullName, UFS } from "./Field";
import { ErrorDialog } from "./ErrorDialog";
import { dadosProblem, emailOk, serverProblem } from "./explain";
import { Footer } from "./Footer";
import { ItemsSummary } from "./ItemsSummary";
import { previewItemsQuotes, type ItemsLine, type ItemsModeProps } from "./items-types";
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

/** Checkout em uma página (2026-10-14, referência Luna Checkout). false volta ao fluxo por etapas. */
const ONE_PAGE = true;
const TOKEN_KEY = "ck-cart-token-unit-149";
const STEP_NAMES = ["Seus dados", "Entrega", "Pagamento"] as const;
const STEP_OF: Record<StepName, number> = { dados: 1, entrega: 2, pagamento: 3 };
const EMPTY: FormData = { name: "", email: "", phone: "", cpf: "", cep: "", street: "", number: "", extra: "", district: "", city: "", state: "", recipient: "" };
const ADDRESS_KEYS: FieldKey[] = ["cep", "street", "number", "extra", "district", "city", "state", "recipient"];

type ViaCep = { erro?: unknown; logradouro?: unknown; bairro?: unknown; localidade?: unknown; uf?: unknown };
/** Primeiro problema achado na validação de um bloco do formulário: texto do aviso, seletor do campo (foco ao fechar o popup) e título do popup. */
type Problem = { message: string; sel?: string; title: string };
const clean =(v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Única chamada externa do checkout: só o CEP vai para o ViaCEP (sem cookies nem referer). Qualquer falha vira preenchimento manual. */
async function fetchCep(cep: string, signal: AbortSignal): Promise<ViaCep | null> {
  const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
  if (!r.ok) return null;
  const j = (await r.json()) as ViaCep;
  return j && typeof j === "object" && !j.erro ? j : null;
}

function readTokenFromStorage(key = TOKEN_KEY): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeTokenToStorage(token: string, key = TOKEN_KEY): void {
  try {
    window.localStorage.setItem(key, token);
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
 * `itemsMode` (multiempresa, 2026-10-13, rota `/c/[slug]`): vários produtos da empresa com quantidade, sem cor, bump,
 * cupom nem banner da campanha; o carrinho vai como `{ company, items }` e o resumo é o `<ItemsSummary />`.
 * Sem `itemsMode` o comportamento do `/checkout` legado é o mesmo de antes.
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
  checkoutReviews = [],
  checkoutBanners = {},
  itemsMode,
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
  checkoutReviews?: CheckoutReview[];
  /** Artes de banner do painel, por produto e dispositivo (lib/checkout/own/banners.ts). Vazio: banner de texto. */
  checkoutBanners?: BannerMap;
  /** Checkout por itens da empresa (`/c/[slug]`). `selection` vira só um marcador sem uso nesse modo. */
  itemsMode?: ItemsModeProps;
}) {
  const router = useRouter();
  // A cor pode ser trocada aqui (ColorPick); a seleção da URL/carrinho é só o ponto de partida.
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [items, setItems] = useState<ItemsLine[]>(itemsMode?.initialItems ?? []);
  const tokenKey = itemsMode ? `ck-cart-token-c-${itemsMode.companySlug}` : TOKEN_KEY;
  const [cartToken, setCartToken] = useState<string | undefined>(initial?.cartToken);
  const [step, setStep] = useState(initial ? STEP_OF[initial.step] : 1);
  const [data, setData] = useState<FormData>(initial ? { ...initial.customer, ...initial.address } : EMPTY);
  const [bump, setBump] = useState(initial?.bump ?? false);
  // Frete da etapa de entrega: grátis por padrão; o FULL é escolha do cliente e o servidor grava no carrinho.
  const [shipping, setShipping] = useState<ShippingMethod>(initial?.shipping ?? "free");
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
  // Uma página: as três seções ficam abertas juntas, então os focos por ação procuram o campo em todo o cartão do fluxo.
  const flow = useRef<HTMLElement>(null);
  const cepReq = useRef<AbortController | null>(null);
  const focusNext = useRef("");
  const autoRecipient = useRef("");
  // Versão do endereço (e dos dados) já gravada pelo blur silencioso do endereço: evita repetir o mesmo POST.
  const savedAddrKey = useRef("");

  const canBump = !itemsMode && bumpEnabled && selection.pack === "unit";
  const hasBump = canBump && bump;
  /** Checkout em uma página ativo: não vale na tela de pedido pago, que segue igual. */
  const one = ONE_PAGE && !paid;

  // Leva o cliente ao primeiro campo da etapa; no celular só a partir da etapa 2, para não abrir o teclado ao carregar. Na etapa 3 o foco vai para o título.
  // Uma página: sem autofoco ao carregar (o cliente vê as três seções e começa por onde quiser).
  useEffect(() => {
    if (paid || one) return;
    const el = panel.current;
    if (!el) return;
    if (step === 3) {
      el.parentElement?.querySelector<HTMLElement>("h3")?.focus();
      return;
    }
    if (step === 1 && !window.matchMedia("(min-width: 1001px)").matches) return;
    el.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: step === 1 });
  }, [step, paid, one]);
  // Foco pedido por uma ação (CEP encontrado → Número; endereço confirmado → frete; cartão aberto com o mouse → número do cartão).
  useEffect(() => {
    const sel = focusNext.current;
    if (!sel) return;
    focusNext.current = "";
    (one ? flow.current : panel.current)?.querySelector<HTMLElement>(sel)?.focus();
  }, [cepState, addrOk, method, one]);
  useEffect(() => () => cepReq.current?.abort(), []);
  // Aviso "checkout aberto" para a equipe (2026-09-30). Uma vez por aba (id de visita no sessionStorage); o
  // servidor ainda limita por visita e por IP. Não roda na tela de pedido já pago nem no modo interno
  // (`?interno=1`, pendência #167, 2026-10-09): visita do dono não gera InitiateCheckout nem e-mail "Checkout aberto".
  const openedSent = useRef(false);
  const visitId = useRef("");
  useEffect(() => {
    if (paid || openedSent.current) return;
    openedSent.current = true;
    // Modo itens: o aviso "checkout aberto" e o InitiateCheckout são do funil do AquaBlast (pack/cor); fora por ora.
    if (itemsMode || internoAtivo()) return;
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
  }, [paid, selection.pack, selection.colors, initialCoupon, itemsMode]);

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

  async function saveCartNow(targetStep: CartStep, bumpValue: boolean, opts: { customer?: boolean; address?: boolean; lead?: CartPayload["lead"]; selection?: Selection; shipping?: ShippingMethod; items?: ItemsLine[]; data?: FormData } = {}, bumpColorValue: Color | null = bumpColor) {
    const sel = opts.selection ?? selection;
    // `opts.data`: dados já corrigidos neste mesmo instante (ex.: destinatário preenchido pelo `prepare`), que o estado do React ainda não refletiu.
    const d = opts.data ?? data;
    const version = ++quoteVersion.current;
    const token = tokenRef.current ?? cartToken ?? readTokenFromStorage(tokenKey);
    const payload: CartPayload = itemsMode
      ? {
          token,
          company: itemsMode.companySlug,
          items: (opts.items ?? items).map((i) => ({ productSlug: i.productSlug, quantity: i.quantity })),
          step: targetStep,
          bump: false,
          shipping: opts.shipping ?? shipping,
          tracking: buildTracking(),
        }
      : {
          token,
          selection: { pack: sel.pack, colors: sel.colors },
          step: targetStep,
          bump: bumpValue,
          shipping: opts.shipping ?? shipping,
          ...(bumpValue && bumpColorValue ? { bumpColor: bumpColorValue } : {}),
          tracking: buildTracking(),
          ...(coupon ? { coupon } : {}),
          ...(visitId.current ? { visit: visitId.current } : {}),
        };
    if (opts.lead) payload.lead = opts.lead;
    if (opts.customer && (d.name || d.email || d.phone || d.cpf)) {
      // Carrinho retomado com CPF vazio: não reenvia o campo — o servidor mantém o CPF cifrado gravado.
      const base = { name: d.name.trim(), email: d.email.trim(), phone: d.phone };
      payload.customer = cpfMasked && d.cpf === "" ? base : { ...base, cpf: d.cpf };
    }
    if (opts.address && (d.street || d.cep)) {
      payload.address = {
        cep: d.cep,
        street: d.street.trim(),
        number: d.number.trim(),
        extra: d.extra.trim() || undefined,
        district: d.district.trim(),
        city: d.city.trim(),
        state: d.state,
        recipient: d.recipient.trim(),
      };
    }
    const result = await postCart(payload);
    if (isApiFail(result)) return result;
    tokenRef.current = result.token;
    setCartToken(result.token);
    // Recuperações explícitas não substituem o carrinho da oferta atual no navegador.
    if (!initial) writeTokenToStorage(result.token, tokenKey);
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
        body: JSON.stringify({ pack: selection.pack, bump: hasBump, coupon: code, shipping }),
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
      setData((p) => fillAddressFromCep(p, { street, district, city, state: uf }));
      focusNext.current = "input[name=number]";
      setCepState("found");
      return;
    }
    // CEP não encontrado, rede fora ou CEP geral da cidade (sem rua): libera tudo para preenchimento manual, aproveitando cidade/UF se vierem.
    // Ao tentar o mesmo CEP novamente, não apaga o endereço que a pessoa já preencheu manualmente.
    // A troca para outro CEP já limpou esses campos em changeAddressCep.
    setData((p) => fillAddressFromCep(p, { street: street || p.street, district: district || p.district, city: city || p.city, state: hasUf ? uf : p.state }));
    focusNext.current = "input[name=street]";
    setCepState("manual");
  }

  function change(key: FieldKey, value: string) {
    const masked = key === "phone" ? maskPhone(value) : key === "cpf" ? maskCPF(value) : key === "cep" ? maskCEP(value) : value;
    setData((p) => key === "cep" ? changeAddressCep(p, masked) : { ...p, [key]: masked });
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
    if (sel) (one ? flow.current : panel.current)?.querySelector<HTMLElement>(sel)?.focus();
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
    if (itemsMode && !items.length) return fail("Adicione pelo menos um produto ao pedido.", undefined, "Pedido vazio");
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
      const problem = addressProblem(data);
      if (problem) return fail(problem.message, problem.sel, problem.title);
      setAddrOk(true);
      setError("");
      const result = await send(() => saveCart("pagamento", bump, { customer: true, address: true }));
      if (isApiFail(result)) return failServer(result);
      setStep(3);
    }
  }

  /** Validação da entrega (etapa 2 do fluxo por etapas e `prepare` da página única): mesma ordem e mesmas mensagens. null = endereço completo. */
  function addressProblem(d: FormData): Problem | null {
    const title = "Confira o endereço";
    if (!/^\d{8}$/.test(d.cep.replace(/\D/g, ""))) return { message: "Informe um CEP com 8 dígitos.", sel: "[name=cep]", title };
    if (cepState === "loading") return { message: "Aguarde um instante: estamos buscando o seu CEP.", title: "Só um instante" };
    if (!d.street.trim()) return { message: "Informe o endereço (rua ou avenida).", sel: "[name=street]", title };
    if (!d.number.trim()) return { message: "Informe o número. Se não houver, escreva S/N.", sel: "[name=number]", title };
    if (!d.district.trim()) return { message: "Informe o bairro.", sel: "[name=district]", title };
    if (!d.city.trim()) return { message: "Informe a cidade.", sel: "[name=city]", title };
    if (!UFS.includes(d.state)) return { message: "Selecione o estado.", sel: "[name=state]", title };
    if (!fullName(d.recipient)) return { message: "Informe o nome de quem vai receber (nome e sobrenome).", sel: "[name=recipient]", title };
    return null;
  }

  // Página única: ao completar a última informação de uma seção, a tela rola sozinha até a próxima (pedido do dono, 2026-10-14).
  // Só dispara quando o foco SAI da seção com ela completa: o "Próximo" do teclado leva à seção seguinte, ou o "OK" fecha o teclado.
  // Não há gatilho por pausa de digitação: a validação aceita entradas parciais ("1" no número, "Maria S" no nome) e a rolagem pulava
  // campos com o cliente ainda digitando (critique do impeccable, P0). O foco nunca é movido por aqui; se o cliente sai da seção para
  // outro lugar (resumo, pagamento), não rola. Uma vez por ciclo: volta a valer quando a seção fica incompleta de novo. Só rola quando
  // a próxima seção não está bem à vista (no computador, muitas vezes não precisa).
  const advanced = useRef<Record<number, boolean>>({});
  const sectionDone = (n: number) => (n === 1 ? !dadosProblem(data, !!cpfMasked) : cepState !== "loading" && !addressProblem({ ...data, recipient: data.recipient || data.name }));
  const done1 = sectionDone(1);
  const done2 = sectionDone(2);
  useEffect(() => {
    if (!done1) advanced.current[1] = false;
    if (!done2) advanced.current[2] = false;
  }, [done1, done2]);
  function handleSectionBlur(e: React.FocusEvent<HTMLOListElement>) {
    const li = (e.target as HTMLElement).closest<HTMLElement>(".ck-step");
    const n = Number(li?.dataset.step);
    const to = e.relatedTarget as HTMLElement | null;
    if ((n !== 1 && n !== 2) || li?.contains(to)) return;
    const target = flow.current?.querySelector<HTMLElement>(`.ck-step[data-step="${n + 1}"]`);
    if (!target || (to && !target.contains(to))) return;
    if (advanced.current[n] || !sectionDone(n)) return;
    advanced.current[n] = true;
    const top = target.getBoundingClientRect().top;
    if (top > 0 && top < window.innerHeight * 0.45) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, top + window.scrollY - 12), behavior: calm ? "auto" : "smooth" });
  }

  /** O destinatário acompanha o nome enquanto estiver vazio ou igual ao último preenchimento automático. */
  function recipientIsAuto(d: FormData): boolean {
    return !d.recipient || d.recipient === autoRecipient.current;
  }

  /** Cópia dos dados com o destinatário automático já aplicado (só para validar e gravar; não mexe no estado nem no `autoRecipient`). */
  function withAutoRecipient(d: FormData): FormData {
    return recipientIsAuto(d) ? { ...d, recipient: d.name.trim().replace(/\s+/g, " ") } : d;
  }

  /** Dados do cliente e endereço que valem uma gravação: muda quando qualquer um deles muda. */
  function savedKey(d: FormData): string {
    return [d.name, d.email, d.phone, d.cpf, ...ADDRESS_KEYS.map((k) => d[k])].join("|");
  }

  /**
   * Página única, gravações em silêncio (bump, cor, frete, itens, saída do endereço): a etapa gravada é "dados" enquanto
   * os dados não estão válidos e "entrega" depois; nunca "pagamento" (só o `prepare`, que é quando a pessoa clica em pagar).
   * Cliente e endereço só vão quando válidos, para o servidor não recusar uma gravação parcial.
   */
  function quietSave(): { step: CartStep; opts: { customer?: boolean; address?: boolean; data: FormData } } {
    const d = withAutoRecipient(data);
    const customerOk = !dadosProblem(d, !!cpfMasked);
    const addressOk = !addressProblem(d);
    return { step: customerOk ? "entrega" : "dados", opts: { ...(customerOk ? { customer: true } : {}), ...(addressOk ? { address: true } : {}), data: d } };
  }

  /**
   * Página única (2026-10-14): chamado pelo botão de pagar (Pix ou cartão) antes de cobrar. Faz o que "Ir para entrega" e
   * "Ir para pagamento" faziam, na mesma ordem e com os mesmos avisos: valida dados e entrega, grava o carrinho como
   * "pagamento" (é essa gravação que dispara o AddPaymentInfo e o aviso de pagamento) e devolve o token dele. null = faltou
   * algo (o aviso já foi mostrado) ou o servidor recusou; quem chamou não cobra.
   */
  async function prepare(): Promise<string | null> {
    if (busy || sending.current || couponBusy) return null;
    if (itemsMode && !items.length) {
      fail("Adicione pelo menos um produto ao pedido.", undefined, "Pedido vazio");
      return null;
    }
    const problem = dadosProblem(data, !!cpfMasked);
    if (problem) {
      fail(problem.message, `[name=${problem.field}]`, problem.title);
      return null;
    }
    // O destinatário nasce com o nome (e acompanha o nome enquanto o cliente não o trocar); o estado só reflete isso no próximo
    // desenho, então a validação e a gravação usam a cópia `d`.
    const d = withAutoRecipient(data);
    if (recipientIsAuto(data)) {
      autoRecipient.current = d.recipient;
      setData((p) => ({ ...p, recipient: d.recipient }));
    }
    const addressIssue = addressProblem(d);
    if (addressIssue) {
      fail(addressIssue.message, addressIssue.sel, addressIssue.title);
      return null;
    }
    setAddrOk(true);
    setError("");
    const result = await send(() => saveCart("pagamento", bump, { customer: true, address: true, data: d }));
    if (isApiFail(result)) {
      failServer(result);
      return null;
    }
    savedAddrKey.current = savedKey(d);
    return result.token;
  }

  // Página única: sair do número ou do destinatário (último campo do endereço) grava o carrinho em silêncio, uma vez por versão
  // dos dados, se cliente e endereço já estão completos. Mesma regra do salvamento parcial do contato: só depois do consentimento.
  function handleAddressBlur() {
    if (!one || consent === null || couponBusy || busy || sending.current) return;
    const d = withAutoRecipient(data);
    if (dadosProblem(d, !!cpfMasked) || addressProblem(d)) return;
    const key = savedKey(d);
    if (savedAddrKey.current === key) return;
    savedAddrKey.current = key;
    void saveCart("entrega", bump, { customer: true, address: true, data: d }).then((result) => {
      if (isApiFail(result)) savedAddrKey.current = "";
    });
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
    const quiet = one ? quietSave() : null;
    void saveCart(quiet ? quiet.step : step === 2 ? "entrega" : "dados", bump, { selection: next, ...(quiet ? quiet.opts : step === 2 ? { customer: true } : {}) }).then((result) => {
      if (isApiFail(result)) setNotice("Não foi possível salvar a cor agora. Ela vai junto quando você continuar.");
    });
  }

  // Modo itens: soma/tira/adiciona produto (etapas 1 e 2). A tela mostra a prévia com os preços do catálogo na hora;
  // com carrinho já criado, grava e o servidor devolve os valores oficiais.
  function handleItemsChange(next: ItemsLine[]) {
    if (!itemsMode || !next.length) return;
    setItems(next);
    setError("");
    ++quoteVersion.current;
    setQuotes((current) => previewItemsQuotes(itemsMode.products, next, current));
    if (!tokenRef.current) return;
    const quiet = one ? quietSave() : null;
    void saveCart(quiet ? quiet.step : step === 2 ? "entrega" : "dados", false, { items: next, ...(quiet ? quiet.opts : step === 2 ? { customer: true } : {}) }).then((result) => {
      if (isApiFail(result)) setNotice("Não foi possível salvar o pedido agora. Ele vai junto quando você continuar.");
    });
  }

  async function syncPaymentCart(value: boolean, color: Color | null) {
    const version = ++paymentSyncVersion.current;
    setPaymentSync("saving");
    try {
      // Página única: segue a regra das gravações em silêncio e cria o carrinho se ainda não existe (o total do bump vem do servidor).
      const quiet = one ? quietSave() : null;
      const result = await saveCart(quiet ? quiet.step : "pagamento", value, quiet ? quiet.opts : { customer: true, address: true }, color);
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

  function handleShippingChange(value: ShippingMethod) {
    if (value === shipping) return;
    setShipping(value);
    setError("");
    // Página única: grava sempre (cria o carrinho se preciso), para o total mostrado ser o cobrado mesmo sem carrinho ainda.
    if (!one && !tokenRef.current) return;
    const quiet = one ? quietSave() : null;
    void saveCart(quiet ? quiet.step : "entrega", bump, quiet ? { ...quiet.opts, shipping: value } : { customer: true, shipping: value }).then((result) => {
      if (isApiFail(result)) setNotice("Não foi possível salvar o frete agora. Ele vai junto quando você continuar.");
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
  const bySlug = new Map((itemsMode?.products ?? []).map((p) => [p.slug, p.name]));
  const paidItems = itemsMode
    ? items.map((i) => `${i.quantity > 1 ? `${i.quantity}x ` : ""}${bySlug.get(i.productSlug) ?? i.productSlug}`)
    : selection.pack === "kit"
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
  const restartHref = itemsMode ? `/c/${itemsMode.companySlug}` : selection.pack === "kit" ? `/checkout?pack=kit&cor1=${c1}&cor2=${c2 ?? c1}` : `/checkout?pack=unit&cor=${c1}`;
  // Página única: a forma de pagamento está sempre à vista; o frete conta como escolhido quando há CEP completo e cidade (o resumo
  // então mostra o frete e o total, em vez de "calculado na entrega").
  const payStep = one || (!paid && step === 3);
  const shippingChosen = one ? /^\d{8}$/.test(data.cep.replace(/\D/g, "")) && !!data.city.trim() : step === 3;
  const editable = !paid && (one || step < 3);
  const payView: PayView = paid ? paid.method : payStep && methods.length > 0 ? method : "preview";
  const shippingCents = paid ? (paid.shippingCents ?? null) : quotes[method].shippingCents;
  const shippingText = shippingCents === null
    ? "Entrega com rastreamento"
    : paid
      ? `Frete · ${shippingCents === 0 ? "Grátis" : money(shippingCents)}`
      : shipping === "full" ? `${shippingLabelOf("full")} · ${money(shippingCents)}` : shippingLabelOf("free");

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
        <em className="ck-ship-tag">{shippingText}</em>
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
  // Página única: o aviso fica só na seção do campo com problema; sem campo, na seção do pagamento (onde está o botão que cobra),
  // exceto "aguarde o CEP", que é da entrega. Assim a mesma frase não aparece em três lugares.
  const errorSection = badField ? (ADDRESS_KEYS.includes(badField) ? 2 : 1) : cepState === "loading" ? 2 : 3;
  const sectionError = (n: number) => (one && errorSection !== n ? null : errorBox);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => void next(e);

  const body = (n: number) =>
    n === 1 ? (
      <StepDados data={data} onChange={change} onContactBlur={handleContactBlur} onSubmit={onSubmit} cpfMasked={cpfMasked} busy={busy} buttonLabel={theme.buttonLabel} error={sectionError(1)} hideSubmit={one} />
    ) : n === 2 ? (
      <StepEntrega data={data} onChange={change} onSubmit={onSubmit} cepState={cepState} addrOk={addrOk} busy={busy} buttonLabel={theme.buttonLabel} shipping={shipping} onShippingChange={handleShippingChange} error={sectionError(2)}
        hideSubmit={one} onAddressBlur={one ? handleAddressBlur : undefined}
        onRetryCep={() => { const digits = data.cep.replace(/\D/g, ""); if (digits.length === 8) void lookupCep(digits); }} />
    ) : itemsMode && methods.length === 0 ? (
      // Empresa sem gateway próprio configurado: credencial nunca é herdada do AquaBlast, então a loja não cobra.
      <ErrorBox>Esta loja ainda não configurou uma forma de pagamento. Fale com a loja para concluir a compra.</ErrorBox>
    ) : cartToken || one ? (
      <StepPagamento
        paymentSync={paymentSync}
        onRetrySync={() => void syncPaymentCart(bump, bumpColor)}
        cartToken={cartToken}
        prepare={one ? prepare : undefined}
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
        theme={theme}
        support={support}
        onPaid={goToOrder}
        onPending={goToOrder}
      />
    ) : (
      <ErrorBox>Não encontramos o seu carrinho. Volte para a etapa de entrega e tente de novo.</ErrorBox>
    );

  return (
    <div className={`ck ck-root ck-conversion${paid ? " ck-conversion-paid" : " ck-reference"}${one ? " ck-one-page" : ""}`} style={themeVars(theme)}>
      {paid ? <ShipBar theme={theme} shippingCents={shippingCents} paid /> : null}
      <TopBar theme={theme} />
      {!paid ? <ShipBar theme={theme} /> : null}
      <main className="container ck-main">
        {!paid && (one || step === 1) && !itemsMode ? <Campaign theme={theme} selection={selection} bump={hasBump} bumpColor={bumpColor} banners={checkoutBanners} /> : null}
        {notice ? (
          <div className="notice" role="alert">
            {notice}{" "}
            <button type="button" onClick={() => setNotice(null)}>
              Ok, entendi
            </button>
          </div>
        ) : null}
        {!paid && !one ? <CheckoutProgress step={step} busy={busy || couponBusy} onEdit={goTo} /> : null}
        {/* Sem a barra de etapas o título da página continua existindo para leitores de tela (era o h1 escondido do CheckoutProgress). */}
        {one ? <h1 className="ck-u-sr-only">Finalize seu pedido</h1> : null}
        <div className="ck-grid" data-shell-step={paid || one ? undefined : step} data-one-page={one || undefined}>
          {itemsMode ? (
            <ItemsSummary
              products={itemsMode.products}
              items={items}
              onItemsChange={editable ? handleItemsChange : null}
              quotes={quotes}
              shippingChosen={shippingChosen}
              payView={payView}
              cardEnabled={methods.includes("card")}
              pixEnabled={methods.includes("pix")}
              deliveryPromise={deliveryPromise}
            />
          ) : <OrderSummary
            selection={selection}
            bump={paid ? bump : hasBump}
            bumpColor={bumpColor}
            quotes={quotes}
            shippingChosen={shippingChosen}
            payView={payView}
            cardEnabled={methods.includes("card")}
            pixEnabled={methods.includes("pix")}
            paid={paid ?? null}
            coupon={coupon}
            couponBusy={couponBusy || busy}
            onCouponApply={applyCoupon}
            deliveryPromise={deliveryPromise}
            selectionEditor={editable ? <ColorPick selection={selection} onChange={handleColorChange} /> : null}
          />}
          <section className="ck-card ck-flow" aria-label="Finalize seu pedido" ref={flow}>
            {paid ? (
              <SuccessView
                orderNumber={paid.orderNumber}
                payment={payment}
                items={paidItems}
                total={money(paid.amountCents)}
                address={address}
                email={data.email}
                testMode={paid.testMode}
                restartHref={restartHref}
                shippingCents={paid.shippingCents}
              />
            ) : null}
            <ol className={`ck-steps${paid ? " is-complete" : ""}`} aria-label="Etapas da compra" onBlur={one ? handleSectionBlur : undefined}>
              {STEP_NAMES.map((name, i) => {
                const n = i + 1;
                // Página única: as três seções ficam abertas ao mesmo tempo (sem EDITAR, sem cadeado, sem "etapa atual").
                const state = one ? "current" : paid || n < step ? "done" : n === step ? "current" : "todo";
                const stepCurrent = state === "current" && !one;
                return (
                  <li key={name} className={`ck-step is-${state}`} data-step={n} aria-current={stepCurrent ? "step" : undefined}>
                    <div className="ck-step-head">
                      <span className="ck-dot" aria-hidden="true">
                        {state === "done" ? <Check size={16} strokeWidth={3} /> : n}
                      </span>
                      <h3 tabIndex={stepCurrent ? -1 : undefined}>
                        {name}
                        {state === "done" ? <span className="ck-u-sr-only"> (concluída)</span> : null}
                      </h3>
                    </div>
                    {/* Etapa futura: só o cabeçalho e o cadeado (auditoria de 2026-10-11). A prévia das formas de pagamento
                        saiu: mostrava Pix e cartão antes de o cliente informar a entrega. */}
                    {!paid && state === "todo" ? (
                      <small className="ck-stage-lock"><LockKeyhole size={13} aria-hidden="true" />{n === 2 ? "Disponível após seus dados" : "Disponível após a entrega"}</small>
                    ) : null}
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
                      <div className="ck-step-body" ref={one ? undefined : panel}>
                        <p className="ck-stage-intro">{n === 1 ? "Preencha seus dados para receber a confirmação e acompanhar seu pedido." : n === 2 ? (itemsMode ? "Cadastre o endereço onde você quer receber seu pedido." : "Cadastre o endereço onde você quer receber seu AquaBlast.") : "Escolha a forma de pagamento para finalizar seu pedido."}</p>
                        <fieldset className="ck-step-fields" disabled={couponBusy}>
                          <BadFieldContext.Provider value={{ field: badField, message: error }}>
                            {body(n)}
                            {one && n === 3 ? sectionError(3) : null}
                          </BadFieldContext.Provider>
                        </fieldset>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
          {/* Coluna lateral do computador (desktop-shell.css): fatos da compra e avaliações, abaixo do resumo. Abaixo de
              1100 px o contêiner não gera caixa (display: contents) e as avaliações ficam ocultas (reference-checkout.css). */}
          <div className="ck-side">
            <TrustSeals methods={methods} maxInstallments={maxInstallments} theme={theme} support={support} payStep={payStep} />
            {!paid ? <CheckoutReviews reviews={checkoutReviews} /> : null}
          </div>
        </div>
      </main>
      <Footer theme={theme} year={year} methods={methods} maxInstallments={maxInstallments} support={support} />
      {popup ? <ErrorDialog title={popup.title} message={popup.message} onClose={closePopup} /> : null}
      {paid ? null : <ConsentBanner requireConsent={consentRequired} onDecide={setConsent} />}
    </div>
  );
}
