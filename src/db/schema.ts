import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Status público do pedido. Mesmo enum do contrato em INTEGRACAO-RASTREAMENTO.md. */
export const orderStatusEnum = pgEnum("order_status", [
  "created",
  "approved",
  "preparing",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
  "cancelled",
]);

/** Situação do pagamento reportada pelo checkout. */
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "refused",
  "refunded",
  "chargeback",
  "cancelled",
  "expired",
]);

export const eventSourceEnum = pgEnum("event_source", ["checkout", "tracking", "admin", "system"]);

export const webhookStatusEnum = pgEnum("webhook_status", [
  "received",
  "processed",
  "ignored",
  "unmapped",
  "error",
  "unauthorized",
]);

/**
 * Empresa padrão (AquaBlast). Fixa e semeada pela migration 0013: toda linha antiga cai nela pelo default das
 * colunas company_id, e o AquaBlast continua lendo os settings globais sem prefixo.
 */
export const DEFAULT_COMPANY_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Empresas que usam o gateway (multiempresa, 2026-10-12). A chave de API é guardada só como SHA-256
 * (api_key_hash) e o começo dela (api_key_prefix) para o painel reconhecer. webhook_secret é cifrado
 * (lib/crypto encryptText), nunca em claro.
 */
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    active: boolean("active").default(true).notNull(),
    apiKeyHash: text("api_key_hash"),
    apiKeyPrefix: text("api_key_prefix"),
    webhookUrl: text("webhook_url"),
    /** Cifrado em repouso. */
    webhookSecret: text("webhook_secret"),
    /** Origens liberadas para chamar a API pelo navegador (CORS). */
    allowedOrigins: jsonb("allowed_origins").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("companies_slug_idx").on(t.slug), uniqueIndex("companies_api_key_hash_idx").on(t.apiKeyHash)],
);

/**
 * Catálogo por empresa. Preço em centavos, separado por Pix e cartão. Para o AquaBlast as linhas
 * unit-azul/unit-vermelho/unit-preto/kit espelham checkout.prices (savePricesSettings mantém em dia).
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    sku: text("sku"),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    imageUrl: text("image_url"),
    pricePixCents: integer("price_pix_cents").notNull(),
    priceCardCents: integer("price_card_cents").notNull(),
    active: boolean("active").default(true).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("products_company_slug_idx").on(t.companyId, t.slug), index("products_company_position_idx").on(t.companyId, t.position)],
);

/**
 * Log das entregas de webhook de saída da empresa (eventos order.paid e order.shipped). Uma linha por evento,
 * com o resultado da última tentativa. O corpo enviado fica em `payload` (sem segredos).
 */
export const companyWebhookDeliveries = pgTable(
  "company_webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    orderId: uuid("order_id"),
    event: text("event").notNull(),
    /** pending | delivered | failed */
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    responseStatus: integer("response_status"),
    error: text("error"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [index("company_webhook_deliveries_company_idx").on(t.companyId, t.createdAt), index("company_webhook_deliveries_order_idx").on(t.orderId)],
);

/** Coluna company_id padrão das tabelas por empresa: NOT NULL, default na empresa AquaBlast. */
const companyIdColumn = () =>
  uuid("company_id")
    .default(DEFAULT_COMPANY_ID)
    .references(() => companies.id, { onDelete: "restrict" })
    .notNull();

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: companyIdColumn(),
    /** Número visível para o cliente e para o admin (do checkout quando existir). */
    orderNumber: text("order_number").notNull(),
    /** Identificador interno do checkout (id da transação/pedido). */
    externalId: text("external_id"),
    checkoutProvider: text("checkout_provider").default("generic").notNull(),

    status: orderStatusEnum("status").default("created").notNull(),
    paymentStatus: paymentStatusEnum("payment_status").default("pending").notNull(),
    paymentMethod: text("payment_method"),
    /** Dados para "reenviar o Pix" (remarketing). */
    pixCode: text("pix_code"),
    pixQrUrl: text("pix_qr_url"),
    pixExpiresAt: timestamp("pix_expires_at", { withTimezone: true }),
    paymentUrl: text("payment_url"),

    /** Inteiro monotônico por pedido: toda mudança relevante incrementa. */
    revision: integer("revision").default(1).notNull(),

    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone"),
    /** CPF cifrado em repouso (AES-GCM). Nunca exibido inteiro. */
    customerDocumentEnc: text("customer_document_enc"),

    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    addressNeighborhood: text("address_neighborhood"),
    addressCity: text("address_city"),
    addressState: text("address_state"),
    addressPostalCode: text("address_postal_code"),
    addressCountry: text("address_country").default("Brasil"),

    /** [{ name, sku, variant, quantity, unitPrice }] */
    items: jsonb("items").$type<OrderItem[]>().default([]).notNull(),
    amountTotal: numeric("amount_total", { precision: 10, scale: 2 }),
    currency: text("currency").default("BRL").notNull(),
    utm: jsonb("utm").$type<Record<string, string>>(),

    trackingCode: text("tracking_code"),
    trackingUrl: text("tracking_url"),
    carrierName: text("carrier_name"),
    carrierCode: text("carrier_code"),
    trackingProvider: text("tracking_provider"),
    trackingRegisteredAt: timestamp("tracking_registered_at", { withTimezone: true }),
    trackingLastSyncAt: timestamp("tracking_last_sync_at", { withTimezone: true }),
    trackingLastStatus: text("tracking_last_status"),
    trackingSyncError: text("tracking_sync_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    preparingAt: timestamp("preparing_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    inTransitAt: timestamp("in_transit_at", { withTimezone: true }),
    outForDeliveryAt: timestamp("out_for_delivery_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    cartId: uuid("cart_id"),
    installments: integer("installments"),
    /** Token público da página /checkout/pedido/<token>. */
    publicToken: text("public_token"),
    fbp: text("fbp"),
    fbc: text("fbc"),
    gaClientId: text("ga_client_id"),
    gaSessionId: text("ga_session_id"),
    clientIp: text("client_ip"),
    userAgent: text("user_agent"),
    trackingConsent: boolean("tracking_consent").default(false).notNull(),

    adminNotes: text("admin_notes"),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    reminderCount: integer("reminder_count").default(0).notNull(),
    /** Quando o admin foi avisado por e-mail de que o pedido passou do SLA de postagem (um aviso por pedido). */
    slaAlertedAt: timestamp("sla_alerted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("orders_order_number_idx").on(t.orderNumber),
    uniqueIndex("orders_external_id_idx").on(t.checkoutProvider, t.externalId),
    index("orders_status_idx").on(t.status),
    index("orders_payment_status_idx").on(t.paymentStatus),
    index("orders_email_idx").on(t.customerEmail),
    index("orders_tracking_code_idx").on(t.trackingCode),
    index("orders_created_at_idx").on(t.createdAt),
    index("orders_company_created_idx").on(t.companyId, t.createdAt),
  ],
);

export type OrderItem = {
  name: string;
  sku?: string | null;
  variant?: string | null;
  quantity: number;
  unitPrice?: number | null;
  /** Snapshot do checkout próprio, gravado no JSON existente; ausente em pedidos antigos/externos. */
  checkoutPricing?: {
    productSubtotalCents: number;
    shippingCents: number;
    /** Frete escolhido (2026-10-11). Ausente em pedidos anteriores à escolha de frete. */
    shippingMethod?: "free" | "full";
    couponDiscountCents: number;
  };
};

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    title: text("title").notNull(),
    description: text("description").default("").notNull(),
    source: eventSourceEnum("source").default("system").notNull(),
    /** Status do pedido após este evento (quando o evento mudou status). */
    status: orderStatusEnum("status"),
    /** Chave de deduplicação (ex.: hash do evento da transportadora). */
    dedupeKey: text("dedupe_key"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("order_events_order_idx").on(t.orderId, t.occurredAt),
    uniqueIndex("order_events_dedupe_idx").on(t.orderId, t.dedupeKey),
  ],
);

export const orderAccessCodes = pgTable(
  "order_access_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    /** SHA-256 do código: é o que a consulta pública compara. */
    codeHash: text("code_hash").notNull(),
    /**
     * Código em claro, cifrado em repouso (lib/crypto encryptText). Existe para repetir o mesmo código em todos os
     * e-mails do pedido (pedido do dono, 2026-10-02). NULL nas linhas de antes da migration 0009.
     */
    codeEnc: text("code_enc"),
    /** Começo do código, só para o admin reconhecer qual código está ativo. */
    prefix: text("prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    useCount: integer("use_count").default(0).notNull(),
  },
  (t) => [uniqueIndex("order_access_codes_hash_idx").on(t.codeHash), index("order_access_codes_order_idx").on(t.orderId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(), // checkout | tracking
    provider: text("provider"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    /** SHA-256 do corpo bruto: mesmo corpo entregue duas vezes = ignorado. */
    bodyHash: text("body_hash").notNull(),
    headers: jsonb("headers").$type<Record<string, string>>(),
    payload: jsonb("payload"),
    status: webhookStatusEnum("status").default("received").notNull(),
    detail: text("detail"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("webhook_deliveries_hash_idx").on(t.source, t.bodyHash), index("webhook_deliveries_received_idx").on(t.receivedAt)],
);

export const emailTemplates = pgTable("email_templates", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  /** Envio automático ligado (ex.: confirmação ao aprovar). Reenvio manual sempre funciona. */
  enabled: boolean("enabled").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    cartId: uuid("cart_id"),
    to: text("to").notNull(),
    templateKey: text("template_key"),
    subject: text("subject").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(), // sent | error
    error: text("error"),
    messageId: text("message_id"),
    triggeredBy: text("triggered_by").default("system").notNull(), // system | admin:<email>
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("email_log_order_idx").on(t.orderId, t.sentAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  /** JSON em claro, ou string cifrada (AES-GCM base64) quando encrypted = true. */
  value: jsonb("value"),
  encrypted: boolean("encrypted").default(false).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
});

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  /**
   * Última troca/redefinição de senha. Sessões (JWT) emitidas antes disso são recusadas por
   * getActiveAdminSession: trocar a senha derruba todas as sessões abertas, inclusive as de 30 dias.
   */
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
});

/**
 * Links de "Esqueci minha senha" do painel. Só o SHA-256 (hex) do token fica no banco;
 * o token em claro existe apenas no link do e-mail. Uso único (used_at) e validade curta (expires_at).
 */
export const adminPasswordResets = pgTable(
  "admin_password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id")
      .references(() => adminUsers.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    requestedIp: text("requested_ip"),
  },
  (t) => [uniqueIndex("admin_password_resets_token_hash_idx").on(t.tokenHash), index("admin_password_resets_user_idx").on(t.adminUserId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").default(0).notNull(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type OrderStatus = Order["status"];
export type PaymentStatus = Order["paymentStatus"];
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminPasswordReset = typeof adminPasswordResets.$inferSelect;

/** Etapa em que o carrinho está (ou onde parou). */
export const cartStepEnum = pgEnum("cart_step", ["dados", "entrega", "pagamento", "concluido"]);
/** open = em andamento; abandoned = parado além do prazo; recovered = virou pedido pago depois de e-mail; converted = pagou direto. */
export const cartStatusEnum = pgEnum("cart_status", ["open", "abandoned", "recovered", "converted"]);

export const checkoutCarts = pgTable(
  "checkout_carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: companyIdColumn(),
    /** Token público do link de retomada. Nunca usar o id na URL. */
    token: text("token").notNull().unique(),
    status: cartStatusEnum("status").default("open").notNull(),
    step: cartStepEnum("step").default("dados").notNull(),
    pack: text("pack").notNull(), // unit | kit
    colors: jsonb("colors").$type<string[]>().notNull(), // ["azul"] ou ["azul","preto"]
    /**
     * Itens do carrinho multiempresa (API v1 / checkout por slug). NULL no modo legado do AquaBlast,
     * que continua usando pack + colors.
     */
    items: jsonb("items").$type<CartItem[]>(),
    bumpAccepted: boolean("bump_accepted").default(false).notNull(),
    /** Frete escolhido na etapa de entrega: free | full. O valor cobrado sai de quote() com este campo. */
    shippingMethod: text("shipping_method").default("free").notNull(),
    amountCents: integer("amount_cents").notNull(),
    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone"),
    customerDocumentEnc: text("customer_document_enc"),
    addressLine1: text("address_line1"),
    addressNumber: text("address_number"),
    addressLine2: text("address_line2"),
    addressNeighborhood: text("address_neighborhood"),
    addressCity: text("address_city"),
    addressState: text("address_state"),
    addressPostalCode: text("address_postal_code"),
    recipient: text("recipient"),
    utm: jsonb("utm").$type<Record<string, string>>(),
    /** Identificadores de anúncio. Só gravados com consentimento. */
    fbp: text("fbp"),
    fbc: text("fbc"),
    gaClientId: text("ga_client_id"),
    gaSessionId: text("ga_session_id"),
    clientIp: text("client_ip"),
    userAgent: text("user_agent"),
    consent: boolean("consent").default(false).notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    recoveryEmailCount: integer("recovery_email_count").default(0).notNull(),
    lastRecoveryEmailAt: timestamp("last_recovery_email_at", { withTimezone: true }),
    /** Comprador pediu para não receber mais e-mail de recuperação. */
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("checkout_carts_status_idx").on(t.status, t.lastActivityAt),
    index("checkout_carts_email_idx").on(t.customerEmail),
    index("checkout_carts_company_idx").on(t.companyId, t.createdAt),
  ],
);

/** Uma linha por tentativa de cobrança. NUNCA guarda número de cartão, validade ou CVV. */
export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
    companyId: companyIdColumn(),
    cartId: uuid("cart_id").references(() => checkoutCarts.id, { onDelete: "set null" }),
    provider: text("provider").notNull(), // ironpay | mercadopago | fastpay | simulado
    method: text("method").notNull(), // pix | card
    providerTransactionId: text("provider_transaction_id"),
    status: text("status").notNull(), // pending | paid | refused | canceled | refunded | error
    statusReason: text("status_reason"),
    amountCents: integer("amount_cents").notNull(),
    installments: integer("installments").default(1).notNull(),
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("payment_attempts_order_idx").on(t.orderId, t.createdAt),
    uniqueIndex("payment_attempts_provider_tx_idx").on(t.provider, t.providerTransactionId),
  ],
);

/** Log de eventos enviados para Meta CAPI e GA4. Serve de prova e de deduplicação. */
export const conversionEvents = pgTable(
  "conversion_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    cartId: uuid("cart_id").references(() => checkoutCarts.id, { onDelete: "set null" }),
    destination: text("destination").notNull(), // meta | ga4
    eventName: text("event_name").notNull(),
    eventId: text("event_id").notNull(),
    status: text("status").notNull(), // sent | error | skipped
    detail: text("detail"),
    /** Corpo JSON enviado ao destino (sem token: o token da Meta vai na URL). user_data já vai com hash. */
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("conversion_events_dedupe_idx").on(t.destination, t.eventName, t.eventId)],
);

/**
 * Visitas ao site público (uma linha por carregamento de página), gravadas por POST /api/track/page.
 * Alimenta o topo do funil do dashboard (visitantes → viram o produto) e o PageView/ViewContent da CAPI.
 * Sem dado pessoal: visitor_id é um id aleatório do cookie aqb_vid, não o IP.
 */
export const siteVisits = pgTable(
  "site_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** event_id do PageView (o mesmo que o Pixel do navegador manda, para a Meta deduplicar). */
    eventId: text("event_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    path: text("path").notNull(),
    /** Carregou a página do produto (home): houve ViewContent. */
    viewedProduct: boolean("viewed_product").default(false).notNull(),
    utmSource: text("utm_source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("site_visits_event_idx").on(t.eventId), index("site_visits_created_idx").on(t.createdAt)],
);

/**
 * Cliques no botão Comprar da LP (pedido do dono, 2026-10-02), gravados por POST /api/track/click. Mostra no
 * painel (/admin/cliques) quem clicou, em qual kit e cores, e se depois chegou ao checkout. Sem dado pessoal.
 */
export const buyClicks = pgTable(
  "buy_clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Id do clique gerado no navegador: o mesmo clique repetido (rede instável) não conta duas vezes. */
    eventId: text("event_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    pack: text("pack").$type<"unit" | "kit">().notNull(),
    /** Cores na tela no momento do clique, separadas por "+" (kit: "azul+preto"). */
    colors: text("colors").notNull(),
    /** Escolha completa (cor da unidade ou as duas do kit tocadas pelo cliente). */
    complete: boolean("complete").notNull(),
    /** Escolha incompleta: o clique só avisou e levou à cor que falta, não foi para o checkout. */
    warnedOnly: boolean("warned_only").default(false).notNull(),
    /** Onde estava o botão: "topo" (painel do produto no desktop) ou "ofertas" (cards de preço). */
    place: text("place").notNull(),
    device: text("device").$type<"mobile" | "desktop">().notNull(),
    utmSource: text("utm_source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("buy_clicks_event_idx").on(t.eventId), index("buy_clicks_created_idx").on(t.createdAt)],
);

/**
 * Item do carrinho multiempresa. productId aponta para products.id; o snapshot (nome, sku, preços) é gravado
 * no momento em que o carrinho é montado, para o pedido não mudar se o catálogo mudar depois.
 */
export type CartItem = {
  productId: string;
  quantity: number;
  slug?: string;
  name?: string;
  sku?: string | null;
  unitPixCents?: number;
  unitCardCents?: number;
};

export type CheckoutCart = typeof checkoutCarts.$inferSelect;
export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type ConversionEvent = typeof conversionEvents.$inferSelect;
export type BuyClick = typeof buyClicks.$inferSelect;

/**
 * Aparelhos inscritos no Web Push do app do painel (PWA /admin). Uma linha por navegador/aparelho.
 * p256dh e auth são as chaves PÚBLICAS do navegador (RFC 8291) - não são segredo nosso.
 * 404/410 do serviço de push apagam a linha; outras falhas só somam failCount.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, { onDelete: "cascade" }),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
    failCount: integer("fail_count").default(0).notNull(),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint)],
);

/**
 * Trava de "não repetir" dos avisos push: pagamento uma vez por carrinho (inicio: limite por visita na rota /api/checkout/opened), pago uma vez por pedido.
 * dedupe_key = "<evento>:<cartId|orderId>". Separada do email_log de propósito: push e e-mail são independentes.
 */
export const pushAlerts = pgTable(
  "push_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dedupeKey: text("dedupe_key").notNull(),
    event: text("event").notNull(),
    sentCount: integer("sent_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("push_alerts_dedupe_idx").on(t.dedupeKey)],
);

/** Coluna bytea (o Drizzle não traz pronta): o driver pg já devolve e aceita Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Comentários de clientes exibidos no checkout, cadastrados pelo painel (/admin/checkout/comentarios).
 * Só os ativos aparecem, na ordem de `position`. Sem fallback no código: sem nenhum ativo, o bloco some.
 */
export const checkoutReviews = pgTable(
  "checkout_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: companyIdColumn(),
    author: text("author").notNull(),
    score: integer("score").notNull(),
    comment: text("comment").notNull(),
    position: integer("position").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("checkout_reviews_position_idx").on(t.position), index("checkout_reviews_company_idx").on(t.companyId, t.position)],
);

/**
 * Fotos dos comentários do checkout (até 3 por comentário). O arquivo fica no banco porque a produção
 * roda em Docker sem volume: disco local some a cada deploy. Servidas por /api/checkout/review-image/[id].
 */
export const checkoutReviewImages = pgTable(
  "checkout_review_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .references(() => checkoutReviews.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("position").default(0).notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("checkout_review_images_review_idx").on(t.reviewId, t.position)],
);

/**
 * Arte do banner do checkout por produto e por dispositivo, enviada pelo painel (/admin/checkout).
 * `product` é "unit-<cor>" ou "kit" e `device` é "desktop" ou "mobile" (listas em lib/checkout/own/banners.ts).
 * No máximo uma linha por par. Trocar a arte apaga a linha e insere outra, com id novo: a URL muda e o
 * cache longo da imagem não segura a arte antiga. Servida por /api/checkout/banner-image/[id].
 */
export const checkoutBanners = pgTable(
  "checkout_banners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: companyIdColumn(),
    product: text("product").notNull(),
    device: text("device").notNull(),
    alt: text("alt").default("").notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("checkout_banners_company_product_device_idx").on(t.companyId, t.product, t.device)],
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Product = typeof products.$inferSelect;
export type CompanyWebhookDelivery = typeof companyWebhookDeliveries.$inferSelect;
