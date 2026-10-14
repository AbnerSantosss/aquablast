import { count, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { checkoutReviewImages, checkoutReviews } from "@/db/schema";
import { adminGuard } from "@/app/api/admin/_lib/guard";
import { fail, json, originAllowed } from "@/app/api/checkout/_lib/http";
import { actorOf, audit } from "@/lib/admin/audit";
import { ensureBootstrap } from "@/lib/bootstrap";
import { checkReviewImage, formatBytes, REVIEW_IMAGE_MAX_BYTES, REVIEW_IMAGES_PER_REVIEW } from "@/lib/checkout/own/reviews-image";
import { reviewImageUrl } from "@/lib/checkout/own/reviews";
import { errorMessage, log } from "@/lib/log";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Teto do corpo inteiro (foto + envelope multipart). Acima disso nem se lê o arquivo. */
const BODY_LIMIT = 12 * 1024 * 1024;

/**
 * Envia uma foto para um comentário do checkout (multipart, campo `file`, uma foto por chamada).
 * Route Handler e não Server Action de propósito: as actions têm teto global de 1 MB no corpo
 * (`experimental.serverActions.bodySizeLimit`) e subir esse teto valeria para todas as actions do site;
 * aqui o limite é só desta rota e a recusa volta com a causa escrita.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail(404, "Comentário não encontrado. Atualize a página.");

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > BODY_LIMIT) return fail(413, `O arquivo tem ${formatBytes(declared)}; o limite é 2 MB. Escolha uma foto menor.`);

  let file: File | null = null;
  try {
    const entry = (await request.formData()).get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return fail(400, "O envio chegou incompleto. Tente de novo.");
  }
  if (!file) return fail(400, "Nenhuma foto chegou. Escolha a foto de novo.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkReviewImage(bytes);
  if (!check.ok) return fail(bytes.length > REVIEW_IMAGE_MAX_BYTES ? 413 : 400, check.message);

  try {
    await ensureBootstrap();
    const [review] = await db.select({ id: checkoutReviews.id, author: checkoutReviews.author }).from(checkoutReviews).where(eq(checkoutReviews.id, id)).limit(1);
    if (!review) return fail(404, "Comentário não encontrado. Atualize a página.");
    const [stats] = await db.select({ total: count(), last: max(checkoutReviewImages.position) }).from(checkoutReviewImages).where(eq(checkoutReviewImages.reviewId, id));
    if ((stats?.total ?? 0) >= REVIEW_IMAGES_PER_REVIEW) {
      return fail(409, `Este comentário já tem ${REVIEW_IMAGES_PER_REVIEW} fotos, que é o limite. Remova uma para enviar outra.`);
    }
    const [created] = await db
      .insert(checkoutReviewImages)
      .values({ reviewId: id, position: (stats?.last ?? 0) + 1, mime: check.info.mime, width: check.info.width, height: check.info.height, bytes: Buffer.from(bytes) })
      .returning({ id: checkoutReviewImages.id });
    await db.update(checkoutReviews).set({ updatedAt: new Date() }).where(eq(checkoutReviews.id, id));
    await audit(
      actorOf(guard.session),
      "checkout_review.image_add",
      { type: "checkout_review", id },
      { imageId: created.id, mime: check.info.mime, width: check.info.width, height: check.info.height, bytes: bytes.length },
    );
    revalidatePath("/checkout");
    revalidatePath("/admin/checkout");
    revalidatePath("/admin/checkout/comentarios");
    return json({ ok: true, image: { id: created.id, url: reviewImageUrl(created.id), width: check.info.width, height: check.info.height } });
  } catch (err) {
    log.error("admin: envio de foto de comentário falhou", { reviewId: id, error: errorMessage(err) });
    return fail(500, "Não deu para gravar a foto agora. Tente de novo em instantes.");
  }
}
