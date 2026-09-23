import type { OrderItem, PaymentStatus } from "@/db/schema";

/**
 * O checkout usado (seguro.elefantol-oficial.store, white-label) não tem formato de webhook
 * documentado. Este normalizador é heurístico: procura os campos em vários caminhos comuns
 * (Yampi, CartPanda, Appmax, Hotmart, Kiwify, Shopify-like, Pagar.me) e aceita um mapa
 * de campos configurável no painel (`checkout.fieldMap`, dot-paths) que tem prioridade.
 * Se não encontrar um identificador do pedido, o webhook é gravado como `unmapped`
 * para tratamento manual no painel.
 */
export interface NormalizedCheckout {
  externalId: string | null;
  orderNumber: string | null;
  eventName: string | null;
  paymentStatus: PaymentStatus | null;
  paymentMethod: string | null;
  pixCode: string | null;
  pixQrUrl: string | null;
  pixExpiresAt: Date | null;
  paymentUrl: string | null;
  customer: { name: string | null; email: string | null; phone: string | null; document: string | null };
  address: {
    line1: string | null;
    line2: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
  items: OrderItem[];
  amountTotal: number | null;
  utm: Record<string, string> | null;
  trackingCode: string | null;
  carrierName: string | null;
  /** Quais campos essenciais faltaram (para o log). */
  missing: string[];
}

type Json = Record<string, unknown>;

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(part)) cur = cur[Number(part)];
    else if (typeof cur === "object") cur = (cur as Json)[part];
    else return undefined;
  }
  return cur;
}

function first(obj: unknown, paths: string[]): unknown {
  for (const p of paths) {
    const v = getPath(obj, p);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v).trim() || null);

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d.,-]/g, "");
  // "1.234,56" → 1234.56 ; "159.90" → 159.90 ; "15990" (centavos) fica a critério do fieldMap
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

const dateOf = (v: unknown): Date | null => {
  if (!v) return null;
  const d = typeof v === "number" ? new Date(v > 1e12 ? v : v * 1000) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Traduz o status textual da plataforma para o nosso enum de pagamento. */
export function mapPaymentStatus(raw: string | null | undefined, eventName?: string | null): PaymentStatus | null {
  const s = `${eventName ?? ""} ${raw ?? ""}`.toLowerCase();
  if (!s.trim()) return null;
  if (/chargeback|charged_back|disputa|dispute/.test(s)) return "chargeback";
  if (/refund|estorn|reembols/.test(s)) return "refunded";
  if (/expired|expirad|vencid/.test(s)) return "expired";
  if (/cancel/.test(s)) return "cancelled";
  if (/refus|recus|declin|failed|falh|negad|denied|unauthorized/.test(s)) return "refused";
  if (/paid|pago|approved|aprovad|confirm|completed|complet|succe|authorized|autorizad|captured|order\.paid|purchase_approved|sale/.test(s)) return "paid";
  if (/pending|pendent|waiting|aguard|processing|processando|created|criado|generated|gerado|abandon|billet|boleto|pix/.test(s)) return "pending";
  return null;
}

function normalizeItems(raw: unknown): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it): OrderItem | null => {
      if (!it || typeof it !== "object") return null;
      const name = str(first(it, ["name", "title", "product_name", "product.name", "product.title", "description", "item_name"]));
      if (!name) return null;
      return {
        name,
        sku: str(first(it, ["sku", "code", "product.sku", "variant.sku", "product_id", "id"])),
        variant: str(first(it, ["variant", "variant_title", "variant.name", "option", "color", "variation", "offer_name", "plan_name"])),
        quantity: num(first(it, ["quantity", "qty", "amount_items", "units"])) ?? 1,
        unitPrice: num(first(it, ["price", "unit_price", "unitPrice", "amount", "value", "price_unit"])),
      };
    })
    .filter((x): x is OrderItem => !!x);
}

function normalizeUtm(payload: unknown): Record<string, string> | null {
  const out: Record<string, string> = {};
  const candidates = ["utm", "utms", "tracking", "metadata", "custom_fields", "marketing"] as const;
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "src", "sck"]) {
    const v = first(payload, [key, ...candidates.map((c) => `${c}.${key}`), `checkout.${key}`, `order.${key}`]);
    if (v !== undefined) out[key] = String(v);
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param payload corpo JSON do webhook
 * @param fieldMap mapa opcional { campoInterno: "caminho.no.payload" } configurado no painel
 */
export function normalizeCheckoutPayload(payload: unknown, fieldMap: Record<string, string> = {}): NormalizedCheckout {
  const p = payload as Json;
  const m = (key: string, defaults: string[]): unknown => (fieldMap[key] ? getPath(p, fieldMap[key]) : first(p, defaults));

  const eventName = str(m("eventName", ["event", "event_type", "type", "topic", "action", "webhook_event", "status_event", "trigger"]));
  const rawStatus = str(
    m("paymentStatus", [
      "status",
      "payment_status",
      "financial_status",
      "order.status",
      "order.payment_status",
      "order.financial_status",
      "data.status",
      "data.payment_status",
      "transaction.status",
      "payment.status",
      "purchase.status",
      "sale_status",
      "data.purchase.status",
    ]),
  );
  const externalId = str(
    m("externalId", [
      "order_id",
      "orderId",
      "transaction_id",
      "transactionId",
      "order.id",
      "data.id",
      "data.order_id",
      "data.order.id",
      "purchase.transaction",
      "data.purchase.transaction",
      "transaction.id",
      "checkout_id",
      "id",
    ]),
  );
  const orderNumber = str(m("orderNumber", ["order_number", "orderNumber", "number", "order.number", "order.order_number", "data.order_number", "data.number", "code", "order.code", "reference", "order_ref"])) ?? externalId;
  const customerRoot = first(p, ["customer", "buyer", "client", "data.customer", "data.buyer", "order.customer", "user", "data.user"]);
  const addrRoot = first(p, [
    "shipping_address",
    "shippingAddress",
    "address",
    "delivery_address",
    "customer.address",
    "customer.shipping_address",
    "order.shipping_address",
    "data.shipping_address",
    "data.address",
    "data.customer.address",
    "shipping.address",
    "data.shipping.address",
  ]);
  const pixRoot = first(p, ["pix", "payment.pix", "data.pix", "data.payment.pix", "transaction.pix", "charge.pix", "pix_data"]);

  const customer = {
    name: str(m("customerName", ["customer.name", "customer.full_name", "customer.first_name", "buyer.name", "client.name", "name", "data.customer.name", "data.buyer.name", "user.name", "data.user.name", "billing.name", "shipping.name"])) ?? str(getPath(customerRoot, "name")),
    email: str(m("customerEmail", ["customer.email", "buyer.email", "client.email", "email", "data.customer.email", "data.buyer.email", "user.email", "data.user.email", "contact_email"])) ?? str(getPath(customerRoot, "email")),
    phone: str(m("customerPhone", ["customer.phone", "customer.phone_number", "customer.cellphone", "customer.mobile", "buyer.phone", "phone", "data.customer.phone", "data.buyer.phone", "user.phone", "data.user.phone", "customer.phone.number", "customer.telephone"])) ?? str(getPath(customerRoot, "phone")),
    document: str(m("customerDocument", ["customer.document", "customer.cpf", "customer.cnpj", "customer.document_number", "customer.tax_id", "buyer.document", "buyer.cpf", "document", "cpf", "data.customer.document", "data.customer.cpf", "user.document", "user.cpf"])) ?? str(getPath(customerRoot, "cpf")),
  };

  if (customer.name && /^[^\s]+$/.test(customer.name)) {
    const last = str(first(p, ["customer.last_name", "customer.lastName", "buyer.last_name", "last_name", "data.customer.last_name"]));
    if (last) customer.name = `${customer.name} ${last}`;
  }

  const addr = (key: string, sub: string[]) => str(m(key, sub.flatMap((s) => [s, `data.${s}`, `order.${s}`]))) ?? str(first(addrRoot, sub.map((s) => s.split(".").pop()!)));
  const address = {
    line1:
      addr("addressLine1", ["shipping_address.address1", "shipping_address.street", "shipping_address.address", "address.street", "address.address1", "address.line1", "address.address", "customer.address.street", "customer.street", "street", "address1", "logradouro"]) ??
      str(getPath(addrRoot, "logradouro")),
    line2: addr("addressLine2", ["shipping_address.address2", "shipping_address.complement", "address.number", "address.complement", "address.line2", "address.address2", "customer.address.number", "customer.address.complement", "number", "complement", "complemento", "numero"]),
    neighborhood: addr("addressNeighborhood", ["shipping_address.neighborhood", "shipping_address.district", "address.neighborhood", "address.district", "customer.address.neighborhood", "neighborhood", "district", "bairro"]),
    city: addr("addressCity", ["shipping_address.city", "address.city", "customer.address.city", "city", "cidade"]),
    state: addr("addressState", ["shipping_address.province_code", "shipping_address.state", "shipping_address.province", "address.state", "address.uf", "customer.address.state", "state", "uf", "estado"]),
    postalCode: addr("addressPostalCode", ["shipping_address.zip", "shipping_address.zipcode", "shipping_address.postal_code", "address.zip", "address.zipcode", "address.postal_code", "address.cep", "customer.address.zipcode", "zip", "zipcode", "cep", "postal_code"]),
    country: addr("addressCountry", ["shipping_address.country", "address.country", "customer.address.country", "country", "pais"]) ?? "Brasil",
  };
  // Número + complemento: se line2 ficou só com número e há complemento separado, junta.
  const number = str(first(p, ["shipping_address.number", "address.number", "customer.address.number", "data.shipping_address.number", "numero"]));
  const complement = str(first(p, ["shipping_address.complement", "address.complement", "customer.address.complement", "data.shipping_address.complement", "complemento"]));
  // Com logradouro: o número vai para line1 e line2 fica só com o complemento (evita "Rua X, 10 / 10").
  if (address.line1 && number) {
    if (!address.line1.includes(number)) address.line1 = `${address.line1}, ${number}`;
    address.line2 = complement ?? (address.line2 === number ? null : address.line2);
  } else if (number || complement) {
    address.line2 = [number, complement].filter(Boolean).join(" - ");
  }

  const itemsRaw = fieldMap.items ? getPath(p, fieldMap.items) : first(p, ["items", "line_items", "products", "order.items", "order.line_items", "order.products", "data.items", "data.products", "data.line_items", "cart.items", "purchase.products"]);
  let items = normalizeItems(itemsRaw);
  if (!items.length) {
    const single = str(first(p, ["product.name", "product_name", "data.product.name", "purchase.product.name", "data.product_name", "offer.name"]));
    if (single) items = [{ name: single, quantity: num(first(p, ["quantity", "qty"])) ?? 1, unitPrice: null }];
  }

  const amountTotal = num(m("amountTotal", ["total", "total_price", "amount", "amount_total", "order.total", "order.total_price", "data.total", "data.amount", "transaction.amount", "purchase.price.value", "data.purchase.price.value", "payment.amount", "value", "total_amount", "price"]));
  const rawMethod = str(m("paymentMethod", ["payment_method", "paymentMethod", "payment.method", "payment.type", "payment_type", "transaction.payment_method", "data.payment_method", "purchase.payment.type", "data.purchase.payment.type", "method", "gateway"]));
  const pixCode = str(m("pixCode", ["pix.qr_code", "pix.qrcode", "pix.qr_code_text", "pix.code", "pix.copy_paste", "pix.emv", "pix.payload", "pix_code", "pix_qr_code", "pix_copia_cola", "payment.pix.qr_code", "payment.pix_code", "payment.pix.code", "data.pix.qr_code", "data.pix_code", "transaction.pix.qr_code", "charge.pix.qr_code", "qr_code", "qrcode_text", "emv"])) ?? str(getPath(pixRoot, "qr_code"));
  const pixQrUrl = str(m("pixQrUrl", ["pix.qr_code_url", "pix.qrcode_url", "pix.qr_code_image", "pix.image", "pix.qr_code_base64", "pix_qr_code_url", "payment.pix.qr_code_url", "data.pix.qr_code_url", "qr_code_url", "qrcode_url"]));
  const pixExpiresAt = dateOf(m("pixExpiresAt", ["pix.expires_at", "pix.expiration", "pix.expiration_date", "pix.expires_in", "pix_expires_at", "payment.pix.expires_at", "data.pix.expires_at", "expires_at"]));
  const paymentUrl = str(m("paymentUrl", ["payment_url", "paymentUrl", "checkout_url", "payment_link", "pix.payment_url", "pix.url", "boleto_url", "billet_url", "order.payment_url", "data.payment_url", "data.checkout_url", "url", "link"]));

  const paymentMethod = rawMethod ? rawMethod.toLowerCase() : pixCode ? "pix" : null;
  const paymentStatus = mapPaymentStatus(rawStatus, eventName);

  const trackingCode = str(m("trackingCode", ["tracking_code", "trackingCode", "tracking.code", "tracking_number", "shipping.tracking_code", "order.tracking_code", "data.tracking_code", "fulfillment.tracking_number", "fulfillments.0.tracking_number"]));
  const carrierName = str(m("carrierName", ["carrier", "shipping_carrier", "tracking.carrier", "shipping.carrier", "shipping.company", "fulfillment.tracking_company", "fulfillments.0.tracking_company", "shipping_method"]));

  const missing: string[] = [];
  if (!externalId) missing.push("externalId");
  if (!paymentStatus) missing.push("paymentStatus");
  if (!customer.email) missing.push("customer.email");

  return {
    externalId,
    orderNumber,
    eventName,
    paymentStatus,
    paymentMethod,
    pixCode,
    pixQrUrl,
    pixExpiresAt,
    paymentUrl,
    customer,
    address,
    items,
    amountTotal,
    utm: normalizeUtm(p),
    trackingCode,
    carrierName,
    missing,
  };
}
