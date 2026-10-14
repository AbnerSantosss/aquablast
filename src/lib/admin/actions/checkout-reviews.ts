"use server";

import { asc, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { checkoutReviews, DEFAULT_COMPANY_ID } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { actorOf, audit } from "@/lib/admin/audit";
import { bool, str, uuid } from "@/lib/admin/form";
import { fail, ok, type ActionResult } from "@/lib/admin/types";
import { REVIEW_AUTHOR_MAX, REVIEW_COMMENT_MAX } from "@/lib/checkout/own/reviews";

/**
 * Comentários do checkout (/admin/checkout/comentarios): texto, nota, ordem e ativo/inativo.
 * As fotos não passam por aqui: vão pela rota /api/admin/checkout-reviews (ver o porquê lá).
 */

async function begin() {
  const session = await requireAdmin();
  await ensureBootstrap();
  return { actor: actorOf(session) };
}

function refresh() {
  revalidatePath("/checkout");
  revalidatePath("/admin/checkout");
  revalidatePath("/admin/checkout/comentarios");
}

type Fields = { author: string; score: number; comment: string };

/** Lê e confere autor, nota e texto. Devolve os campos ou o erro já no formato do painel. */
function readFields(fd: FormData): { ok: true; data: Fields } | { ok: false; result: ActionResult } {
  // Lê um caractere além do limite para saber se passou (str corta no máximo pedido).
  const author = str(fd, "author", REVIEW_AUTHOR_MAX + 1);
  const comment = str(fd, "comment", REVIEW_COMMENT_MAX + 1);
  const score = Number(fd.get("score"));
  const fields: Record<string, string> = {};
  if (!author) fields.author = "Informe o nome de quem escreveu.";
  else if (author.length > REVIEW_AUTHOR_MAX) fields.author = `O nome passa de ${REVIEW_AUTHOR_MAX} caracteres. Encurte.`;
  if (!comment) fields.comment = "Escreva o comentário do cliente.";
  else if (comment.length > REVIEW_COMMENT_MAX) fields.comment = `O comentário passa de ${REVIEW_COMMENT_MAX} caracteres. Encurte o texto.`;
  if (!Number.isInteger(score) || score < 1 || score > 5) fields.score = "A nota vai de 1 a 5 estrelas.";
  const first = Object.values(fields)[0];
  if (first) return { ok: false, result: fail(first, { fields }) };
  return { ok: true, data: { author, score, comment } };
}

export async function createCheckoutReview(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const parsed = readFields(fd);
  if (!parsed.ok) return parsed.result;
  const [last] = await db.select({ value: max(checkoutReviews.position) }).from(checkoutReviews).where(eq(checkoutReviews.companyId, DEFAULT_COMPANY_ID));
  const [created] = await db
    .insert(checkoutReviews)
    .values({ ...parsed.data, companyId: DEFAULT_COMPANY_ID, position: (last?.value ?? 0) + 1, active: bool(fd, "active") })
    .returning({ id: checkoutReviews.id });
  await audit(actor, "checkout_review.create", { type: "checkout_review", id: created.id }, parsed.data);
  refresh();
  // Abre o comentário recém-criado já em edição, que é onde as fotos são enviadas (redirect fora de try/catch).
  redirect(`/admin/checkout/comentarios?editar=${created.id}&criado=1`);
}

export async function updateCheckoutReview(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const id = uuid(fd, "id");
  if (!id) return fail("Comentário não encontrado. Atualize a página.");
  const parsed = readFields(fd);
  if (!parsed.ok) return parsed.result;
  const updated = await db
    .update(checkoutReviews)
    .set({ ...parsed.data, active: bool(fd, "active"), updatedAt: new Date() })
    .where(eq(checkoutReviews.id, id))
    .returning({ id: checkoutReviews.id });
  if (!updated.length) return fail("Comentário não encontrado. Atualize a página.");
  await audit(actor, "checkout_review.update", { type: "checkout_review", id }, { ...parsed.data, active: bool(fd, "active") });
  refresh();
  return ok("Comentário salvo.");
}

export async function setCheckoutReviewActive(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const id = uuid(fd, "id");
  if (!id) return fail("Comentário não encontrado. Atualize a página.");
  const active = fd.get("active") === "1";
  const updated = await db.update(checkoutReviews).set({ active, updatedAt: new Date() }).where(eq(checkoutReviews.id, id)).returning({ id: checkoutReviews.id });
  if (!updated.length) return fail("Comentário não encontrado. Atualize a página.");
  await audit(actor, active ? "checkout_review.activate" : "checkout_review.deactivate", { type: "checkout_review", id });
  refresh();
  return ok(active ? "Comentário ativado: já aparece no checkout." : "Comentário desativado: saiu do checkout.");
}

export async function deleteCheckoutReview(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const id = uuid(fd, "id");
  if (!id) return fail("Comentário não encontrado. Atualize a página.");
  // As fotos saem junto (FK com cascade).
  const removed = await db.delete(checkoutReviews).where(eq(checkoutReviews.id, id)).returning({ author: checkoutReviews.author });
  if (!removed.length) return fail("Comentário não encontrado. Atualize a página.");
  await audit(actor, "checkout_review.delete", { type: "checkout_review", id }, { author: removed[0].author });
  refresh();
  return ok("Comentário excluído.");
}

/** Sobe ou desce um comentário na ordem. Regrava todas as posições (1, 2, 3...) para não sobrar empate. */
export async function moveCheckoutReview(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const id = uuid(fd, "id");
  const direction = fd.get("direction") === "up" ? -1 : 1;
  if (!id) return fail("Comentário não encontrado. Atualize a página.");
  const moved = await db.transaction(async (tx) => {
    const rows = await tx.select({ id: checkoutReviews.id }).from(checkoutReviews).where(eq(checkoutReviews.companyId, DEFAULT_COMPANY_ID)).orderBy(asc(checkoutReviews.position), asc(checkoutReviews.createdAt));
    const from = rows.findIndex((row) => row.id === id);
    if (from < 0) return null;
    const to = from + direction;
    if (to < 0 || to >= rows.length) return false;
    const order = rows.map((row) => row.id);
    [order[from], order[to]] = [order[to], order[from]];
    for (const [index, rowId] of order.entries()) {
      await tx.update(checkoutReviews).set({ position: index + 1 }).where(eq(checkoutReviews.id, rowId));
    }
    return true;
  });
  if (moved === null) return fail("Comentário não encontrado. Atualize a página.");
  if (moved === false) return ok(direction < 0 ? "Já é o primeiro." : "Já é o último.");
  await audit(actor, "checkout_review.move", { type: "checkout_review", id }, { direction: direction < 0 ? "up" : "down" });
  refresh();
  return ok("Ordem atualizada.");
}
