import { ensureBootstrap } from "@/lib/bootstrap";
import { createItemsCart, MAX_CART_LINES, MAX_ITEM_QUANTITY } from "@/lib/checkout/own/items-cart";
import { getCompanyProduct } from "@/lib/companies";
import { authenticateCompany, preflightResponse, v1Error, v1Json } from "@/lib/companies/api-auth";
import { env } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LINES = MAX_CART_LINES;
const MAX_QTY = MAX_ITEM_QUANTITY;

export function OPTIONS(request: Request): Promise<Response> {
  return preflightResponse(request);
}

type Line = { productSlug: string; quantity: number };

function parseItems(body: unknown): Line[] | string {
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>).items : undefined;
  if (!Array.isArray(raw) || raw.length === 0) return "Envie items: [{ productSlug, quantity }].";
  if (raw.length > MAX_LINES) return `No máximo ${MAX_LINES} itens por checkout.`;
  const merged = new Map<string, number>();
  for (const it of raw) {
    const o = typeof it === "object" && it !== null ? (it as Record<string, unknown>) : {};
    const slug = o.productSlug;
    const qty = o.quantity;
    if (typeof slug !== "string" || !slug || slug.length > 120) return "productSlug inválido.";
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return `quantity deve ser inteiro de 1 a ${MAX_QTY}.`;
    merged.set(slug, (merged.get(slug) ?? 0) + qty);
  }
  return [...merged].map(([productSlug, quantity]) => ({ productSlug, quantity: Math.min(quantity, MAX_QTY) }));
}

/** POST /api/v1/checkouts - corpo `{ items: [{ productSlug, quantity }] }`; devolve `{ cartId, checkoutUrl }`. */
export async function POST(request: Request): Promise<Response> {
  try {
    await ensureBootstrap();
    const auth = await authenticateCompany(request);
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return v1Error(400, "bad_request", "Corpo JSON inválido.", auth.origin);
    }
    const items = parseItems(body);
    if (typeof items === "string") return v1Error(400, "bad_request", items, auth.origin);

    for (const line of items) {
      const product = await getCompanyProduct(auth.company.id, line.productSlug);
      if (!product || !product.active) return v1Error(400, "bad_request", `Produto não encontrado ou inativo: ${line.productSlug}.`, auth.origin);
    }

    const { cartId, checkoutUrl } = await createItemsCart({ companyId: auth.company.id, items });
    const absolute = /^https?:\/\//i.test(checkoutUrl) ? checkoutUrl : new URL(checkoutUrl, env().APP_URL).toString();
    return v1Json({ cartId, checkoutUrl: absolute }, 201, auth.origin);
  } catch (err) {
    log.error("api v1 checkouts", { error: errorMessage(err) });
    return v1Error(500, "server_error", "Falha ao criar o checkout.");
  }
}
