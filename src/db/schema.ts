import {
  boolean,
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

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
  ],
);

export type OrderItem = {
  name: string;
  sku?: string | null;
  variant?: string | null;
  quantity: number;
  unitPrice?: number | null;
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
    /** SHA-256 do código. O código em claro só existe no e-mail enviado ao comprador. */
    codeHash: text("code_hash").notNull(),
    /** Primeiros 4 caracteres, só para o admin reconhecer qual código está ativo. */
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
    /** Token público do link de retomada. Nunca usar o id na URL. */
    token: text("token").notNull().unique(),
    status: cartStatusEnum("status").default("open").notNull(),
    step: cartStepEnum("step").default("dados").notNull(),
    pack: text("pack").notNull(), // unit | kit
    colors: jsonb("colors").$type<string[]>().notNull(), // ["azul"] ou ["azul","preto"]
    bumpAccepted: boolean("bump_accepted").default(false).notNull(),
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
  ],
);

/** Uma linha por tentativa de cobrança. NUNCA guarda número de cartão, validade ou CVV. */
export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
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

export type CheckoutCart = typeof checkoutCarts.$inferSelect;
export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type ConversionEvent = typeof conversionEvents.$inferSelect;

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

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
