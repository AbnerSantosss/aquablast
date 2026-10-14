import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { checkoutReviewImages, checkoutReviews } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { errorMessage, log } from "@/lib/log";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Só o que o painel grava. Qualquer outro valor na coluna (nunca SVG) vira 404. */
const SERVED = new Set(["image/jpeg", "image/png", "image/webp"]);

function notFound(): Response {
  return new Response("Não encontrado.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Foto de um comentário do checkout. Pública, mas só de comentário ativo: desativar o comentário no
 * painel tira a foto do ar. O id é o da foto e nunca é reaproveitado (foto trocada = id novo), por
 * isso o cache pode ser longo e imutável.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound();
  try {
    await ensureBootstrap();
    const [row] = await db
      .select({ mime: checkoutReviewImages.mime, bytes: checkoutReviewImages.bytes })
      .from(checkoutReviewImages)
      .innerJoin(checkoutReviews, eq(checkoutReviews.id, checkoutReviewImages.reviewId))
      .where(and(eq(checkoutReviewImages.id, id), eq(checkoutReviews.active, true)))
      .limit(1);
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
    log.error("checkout: foto de comentário falhou", { id, error: errorMessage(err) });
    return notFound();
  }
}
