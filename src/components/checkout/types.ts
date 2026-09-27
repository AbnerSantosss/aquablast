import type { Quote } from "@/lib/checkout/own/pricing";

/** Tipos compartilhados entre os componentes do checkout próprio (fase 8). */

export type StepName = "dados" | "entrega" | "pagamento";

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

export interface CardFormData {
  number: string;
  holderName: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  holderCpf: string;
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
