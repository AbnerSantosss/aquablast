import type { Quote } from "@/lib/checkout/own/pricing";

/** Tipos compartilhados entre os componentes do checkout próprio (fase 8). */

export type StepName = "dados" | "entrega" | "pagamento";

/** Estado da busca do CEP (origem: `CepState`). `idle`/`loading` travam os campos de endereço. */
export type CepState = "idle" | "loading" | "found" | "manual";

export type PayMethodUi = "pix" | "card";

export interface CustomerData {
  name: string;
  email: string;
  phone: string;
  cpf: string;
}

export interface AddressData {
  cep: string;
  street: string;
  number: string;
  extra: string;
  district: string;
  city: string;
  state: string;
  recipient: string;
}

/** Todos os campos das etapas 1 e 2 num objeto só, como na origem (`fields`); o nome vira o `name` do input. */
export type FormData = CustomerData & AddressData;
export type FieldKey = keyof FormData;

/**
 * Estado inicial do checkout quando ele é aberto pelo link de recuperação `/checkout/pedido/<token do carrinho>`
 * (plano 8.8). Vem do servidor, já lido do banco. `cpfMasked` é a ÚNICA forma do CPF que chega à tela
 * (`***.***.789-01`); `customer.cpf` vem vazio e só é reenviado se a pessoa digitar um novo.
 */
export interface CheckoutInitial {
  cartToken: string;
  step: StepName;
  customer: CustomerData;
  cpfMasked: string | null;
  address: AddressData;
  bump: boolean;
}

/**
 * Formato que o POST /api/checkout/pay aceita em `card` (cardSchema em @/lib/checkout/own/schemas: mês e ano
 * NUMÉRICOS, ano com 4 dígitos). Antes da fase 14 o CardPay mandava mês/ano como texto e o servidor recusava
 * com 400 — o formulário agora guarda "MM/AA" (igual à origem) e converte só na hora de enviar.
 */
export interface CardFormData {
  number: string;
  holderName: string;
  expMonth: number;
  expYear: number;
  cvv: string;
  holderCpf: string;
}

/**
 * Pedido já pago, mostrado pela página durável /checkout/pedido/[token] com o MESMO layout do checkout
 * (origem: `SuccessView` dentro do `.ck-flow`, etapas concluídas sem EDITAR). Montado no servidor a partir de
 * `orders` + a última tentativa paga em `payment_attempts` (bandeira/últimos 4 só existem lá).
 */
export interface PaidInfo {
  orderNumber: string;
  method: PayMethodUi;
  amountCents: number;
  installments: number;
  cardBrand: string | null;
  cardLast4: string | null;
  /** Gateway `simulado`: mostra o aviso de modo de teste (plano 8.6). */
  testMode: boolean;
}

/** GET /api/checkout/config, ver src/app/api/checkout/config/route.ts. */
export interface CheckoutConfig {
  ok: true;
  mode: "proprio" | "zedy";
  methods: PayMethodUi[];
  pix: { available: boolean; gateway: string | null };
  card: { enabled: boolean; available: boolean; gateway: string | null; tokenizesCard: boolean; publicConfig: Record<string, string> };
  tokenizesCard: boolean;
  publicConfig: Record<string, string>;
  prices: { unit: { pix: Quote; card: Quote }; kit: { pix: Quote; card: Quote } };
  maxInstallments: number;
  pixTtlSeconds: number;
  bumpEnabled: boolean;
  theme: import("@/lib/checkout/own/theme").Theme;
}

/** POST /api/checkout/cart, ver src/app/api/checkout/cart/route.ts. */
export interface CartResponse {
  ok: true;
  token: string;
  created: boolean;
  quote: { pix: Quote; card: Quote };
  quotes: { pix: Quote; card: Quote };
}

export type PixResult = { code: string; qrUrl: string | null; expiresAt: string };

/** POST /api/checkout/pay, ver src/app/api/checkout/pay/route.ts. */
export type PayResponse =
  | { ok: true; status: "paid"; orderNumber: string; publicToken: string; pix: null; message: null }
  | { ok: true; status: "pending"; orderNumber: string; publicToken: string; pix: PixResult | null; message: string | null }
  | { ok: false; status: "refused" | "error"; orderNumber: string | null; publicToken: string | null; pix: null; message: string | null; error: string; field?: string };

export interface ApiError {
  ok: false;
  error: string;
  field?: string;
}
