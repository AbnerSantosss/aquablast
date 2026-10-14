import { ensureBootstrap } from "@/lib/bootstrap";
import { authenticateCompany, preflightResponse, v1Error, v1Json } from "@/lib/companies/api-auth";
import { listCompanyProducts } from "@/lib/companies";
import { errorMessage, log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request): Promise<Response> {
  return preflightResponse(request);
}

/** GET /api/v1/products - produtos ativos da empresa dona da chave. Preços em centavos. */
export async function GET(request: Request): Promise<Response> {
  try {
    await ensureBootstrap();
    const auth = await authenticateCompany(request);
    if (!auth.ok) return auth.response;
    const rows = await listCompanyProducts(auth.company.id);
    return v1Json(
      {
        products: rows.map((p) => ({
          slug: p.slug,
          sku: p.sku,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          pricePixCents: p.pricePixCents,
          priceCardCents: p.priceCardCents,
        })),
      },
      200,
      auth.origin,
    );
  } catch (err) {
    log.error("api v1 products", { error: errorMessage(err) });
    return v1Error(500, "server_error", "Falha ao listar produtos.");
  }
}
