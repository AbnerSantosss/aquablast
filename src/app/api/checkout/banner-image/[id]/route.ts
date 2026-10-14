import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checkoutBanners } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { BANNER_IMAGE_MIMES } from "@/lib/checkout/own/banners-image";
import { errorMessage, log } from "@/lib/log";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Só o que o painel grava. Qualquer outro valor na coluna (nunca SVG) vira 404. */
const SERVED = new Set<string>(BANNER_IMAGE_MIMES);

function notFound(): Response {
  return new Response("Não encontrado.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Arte de banner do checkout, enviada pelo painel. Pública e só por id: não há listagem nem busca por
 * produto. O id nunca é reaproveitado (arte trocada = linha nova, id novo), por isso o cache pode ser
 * longo e imutável; a arte antiga some com a linha e o id antigo passa a responder 404.
 * Atenção: o `Cache-Control` daqui só chega ao navegador se `next.config.ts` deixar esta rota fora das
 * regras de `no-store` de /api, como já faz com /api/checkout/review-image/.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound();
  try {
    await ensureBootstrap();
    const [row] = await db.select({ mime: checkoutBanners.mime, bytes: checkoutBanners.bytes }).from(checkoutBanners).where(eq(checkoutBanners.id, id)).limit(1);
    if (!row || !SERVED.has(row.mime)) return notFound();
    const body = new Uint8Array(row.bytes);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": row.mime,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (err) {
    log.error("checkout: arte de banner falhou", { id, error: errorMessage(err) });
    return notFound();
  }
}
