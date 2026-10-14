import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { checkoutReviewImages, checkoutReviews } from "@/db/schema";
import { adminGuard } from "@/app/api/admin/_lib/guard";
import { fail, json, originAllowed } from "@/app/api/checkout/_lib/http";
import { actorOf, audit } from "@/lib/admin/audit";
import { ensureBootstrap } from "@/lib/bootstrap";
import { errorMessage, log } from "@/lib/log";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Só o que o painel grava; qualquer outro tipo na coluna não é servido. */
const SERVED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Foto vista de dentro do painel (miniatura da lista e prévia), inclusive de comentário desativado.
 * A rota pública só serve foto de comentário ativo, por isso o painel precisa da sua, com sessão.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ imageId: string }> }): Promise<Response> {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  const { imageId } = await ctx.params;
  if (!UUID_RE.test(imageId)) return fail(404, "Foto não encontrada.");
  try {
    await ensureBootstrap();
    const [row] = await db.select({ mime: checkoutReviewImages.mime, bytes: checkoutReviewImages.bytes }).from(checkoutReviewImages).where(eq(checkoutReviewImages.id, imageId)).limit(1);
    if (!row || !SERVED.has(row.mime)) return fail(404, "Foto não encontrada.");
    const body = new Uint8Array(row.bytes);
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": row.mime, "Content-Length": String(body.byteLength), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    log.error("admin: leitura de foto de comentário falhou", { imageId, error: errorMessage(err) });
    return fail(500, "Não deu para abrir a foto agora.");
  }
}

/** Remove uma foto de um comentário do checkout. */
export async function DELETE(request: Request, ctx: { params: Promise<{ imageId: string }> }): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  const { imageId } = await ctx.params;
  if (!UUID_RE.test(imageId)) return fail(404, "Foto não encontrada. Atualize a página.");
  try {
    await ensureBootstrap();
    const [removed] = await db.delete(checkoutReviewImages).where(eq(checkoutReviewImages.id, imageId)).returning({ reviewId: checkoutReviewImages.reviewId });
    if (!removed) return fail(404, "Foto não encontrada. Atualize a página.");
    await db.update(checkoutReviews).set({ updatedAt: new Date() }).where(eq(checkoutReviews.id, removed.reviewId));
    await audit(actorOf(guard.session), "checkout_review.image_remove", { type: "checkout_review", id: removed.reviewId }, { imageId });
    revalidatePath("/checkout");
    revalidatePath("/admin/checkout");
    revalidatePath("/admin/checkout/comentarios");
    return json({ ok: true });
  } catch (err) {
    log.error("admin: remoção de foto de comentário falhou", { imageId, error: errorMessage(err) });
    return fail(500, "Não deu para remover a foto agora. Tente de novo em instantes.");
  }
}
