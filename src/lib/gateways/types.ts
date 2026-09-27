/**
 * Contrato dos gateways de pagamento (Fase 5.1). Arquivo de TIPOS puros: sem import de servidor,
 * para que browser.ts ("use client") possa importar GatewayName daqui.
 */

export type GatewayName = "ironpay" | "mercadopago" | "fastpay" | "simulado";

/** Status normalizado. Cada gateway traduz o seu para este. */
export type GatewayStatus = "pending" | "paid" | "refused" | "canceled" | "refunded" | "error";

export type GatewayMethod = "pix" | "card";

export interface ChargeAddress {
  street: string;
  number: string;
  extra?: string;
  neighborhood: string;
  city: string;
  state: string;
  /** CEP só dígitos. */
  zip: string;
}

export interface ChargeCustomer {
  name: string;
  email: string;
  /** Só dígitos, com DDD. */
  phone: string;
  /** CPF só dígitos. Vem de decryptText(customerDocumentEnc) na hora da cobrança; nunca é logado. */
  document: string;
  address?: ChargeAddress;
}

/** Dados do cartão em claro. Só existem na memória da requisição. NUNCA gravar, logar ou devolver. */
export interface CardData {
  number: string;
  holderName: string;
  expMonth: number;
  expYear: number;
  cvv: string;
  holderCpf: string;
}

export interface ChargeInput {
  orderId: string;
  orderNumber: string;
  amountCents: number;
  method: GatewayMethod;
  installments: number;
  pack: "unit" | "kit";
  /** Título e SKU do item (titleOf/skuOf do catálogo). */
  title: string;
  sku: string;
  customer: ChargeCustomer;
  /** Chave única por tentativa (id de payment_attempts). Gateways com idempotência usam como X-Idempotency-Key. */
  idempotencyKey: string;
  /** Validade do Pix em segundos (checkout.pixTtlSeconds). */
  pixTtlSeconds: number;
  /** URL absoluta do postback/webhook do gateway, já com o token (`/api/webhooks/gateway/<gateway>/<token>`, ver `postbackUrlFor`). */
  postbackUrl: string;
  clientIp?: string;
  /** Cartão em claro: IronPay, FastPay (se não tokenizar) e simulado. */
  card?: CardData;
  /** Cartão tokenizado no navegador (tokenizeCard de browser.ts): Mercado Pago. */
  cardToken?: string;
  cardBrand?: string;
  cardPaymentMethodId?: string;
  cardIssuerId?: string;
  /** Últimos 4 dígitos quando o número não passa pelo servidor. */
  cardLast4?: string;
}

export interface ChargeResult {
  /** false = cobrança não criada ou recusada; `message` diz o que mostrar ao comprador. */
  ok: boolean;
  status: GatewayStatus;
  /** Id da transação no gateway (hash da IronPay, id do MP...). null quando a criação falhou. */
  transactionId: string | null;
  pix?: {
    /** Código copia-e-cola. */
    code: string;
    /** Imagem/URL do QR quando o gateway fornece. */
    qrUrl?: string;
    expiresAt: Date;
  };
  cardBrand?: string;
  cardLast4?: string;
  /** Mensagem em pt-BR segura para o comprador. */
  message?: string;
  /** Detalhe técnico curto para payment_attempts.statusReason e log. Sem dados sensíveis. */
  reason?: string;
}

export interface StatusResult {
  status: GatewayStatus;
  paidAt?: Date | null;
  reason?: string;
}

export interface Gateway {
  name: GatewayName;
  label: string;
  supports: { pix: boolean; card: boolean };
  /** true = o número do cartão nunca passa pelo nosso servidor (tokenizeCard no navegador). */
  tokenizesCard: boolean;
  /** Tem as credenciais necessárias no painel. */
  configured(): Promise<boolean>;
  /** Chaves públicas que o navegador precisa para tokenizar (ex.: publicKey do MP). Nunca segredos. */
  publicConfig(): Promise<Record<string, string>>;
  charge(input: ChargeInput): Promise<ChargeResult>;
  /** Consulta o status na fonte. Postback nunca é confiado sem isto. */
  fetchStatus(transactionId: string): Promise<StatusResult>;
  refund(transactionId: string, amountCents: number): Promise<{ ok: boolean; message?: string }>;
  /** Tira o id da transação do postback/webhook (corpo + URL). Não valida nada além disso. */
  extractWebhook(payload: unknown, url: URL): { transactionId: string | null };
  /** Valida assinatura do webhook quando o gateway tem uma (MP: x-signature). Ausente = sem assinatura. */
  verifyWebhook?(args: { headers: Headers; rawBody: string; url: URL }): Promise<boolean>;
}

/** Tradução do status do gateway para orders.paymentStatus. `error` não muda o pedido (continua pendente). */
export function toPaymentStatus(status: GatewayStatus): "pending" | "paid" | "refused" | "cancelled" | "refunded" {
  switch (status) {
    case "paid":
      return "paid";
    case "refused":
      return "refused";
    case "canceled":
      return "cancelled";
    case "refunded":
      return "refunded";
    default:
      return "pending";
  }
}
