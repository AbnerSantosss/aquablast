import "@/app/admin/checkout-admin.css";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/admin/ActionForm";
import { ReviewPhotos } from "@/components/admin/checkout-reviews/ReviewPhotos";
import {
  createCheckoutReview,
  deleteCheckoutReview,
  moveCheckoutReview,
  setCheckoutReviewActive,
  updateCheckoutReview,
} from "@/lib/admin/actions/checkout-reviews";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { CHECKOUT_REVIEWS_LIMIT, listAdminCheckoutReviews, REVIEW_AUTHOR_MAX, REVIEW_COMMENT_MAX, type AdminCheckoutReview } from "@/lib/checkout/own/reviews";
import { REVIEW_IMAGES_PER_REVIEW } from "@/lib/checkout/own/reviews-image";
import { getTheme } from "@/lib/checkout/own/theme-server";
import { themeVars } from "@/lib/checkout/own/theme";

export const metadata = { title: "Comentários do checkout | Painel AquaBlast" };

const BASE = "/admin/checkout/comentarios";
/** Rota do painel (com sessão): mostra a foto mesmo com o comentário desativado. */
const adminPhotoUrl = (imageId: string) => `/api/admin/checkout-reviews/images/${imageId}`;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function Stars({ score }: { score: number }) {
  return (
    <span className="cr-stars" role="img" aria-label={`${score} de 5 estrelas`}>
      {Array.from({ length: score }, (_, index) => (
        <Star key={index} size={13} fill="currentColor" aria-hidden="true" />
      ))}
    </span>
  );
}

function Fields({ review }: { review?: AdminCheckoutReview }) {
  return (
    <>
      <div className="grid-2">
        <label className="field">
          <span>Nome de quem escreveu</span>
          <input name="author" defaultValue={review?.author ?? ""} maxLength={REVIEW_AUTHOR_MAX} required autoComplete="off" />
          <span className="hint">Como aparece para o cliente. Até {REVIEW_AUTHOR_MAX} caracteres.</span>
        </label>
        <label className="field">
          <span>Nota</span>
          <select name="score" defaultValue={String(review?.score ?? 5)}>
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} {value === 1 ? "estrela" : "estrelas"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Comentário</span>
        <textarea name="comment" rows={4} defaultValue={review?.comment ?? ""} maxLength={REVIEW_COMMENT_MAX} required />
        <span className="hint">O texto do cliente, como ele escreveu. Até {REVIEW_COMMENT_MAX} caracteres.</span>
      </label>
      <label className="check">
        <input type="checkbox" name="active" defaultChecked={review?.active ?? true} />
        <span>Mostrar no checkout</span>
      </label>
    </>
  );
}

export default async function ComentariosCheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  await ensureBootstrap();
  const params = await searchParams;
  const [reviews, theme] = await Promise.all([listAdminCheckoutReviews(), getTheme()]);
  const editing = reviews.find((review) => review.id === first(params.editar));
  const justCreated = Boolean(editing) && first(params.criado) === "1";
  const shown = reviews.filter((review) => review.active).slice(0, CHECKOUT_REVIEWS_LIMIT);
  const activeTotal = reviews.filter((review) => review.active).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Comentários do checkout</h1>
          <p className="sub">
            Os relatos do bloco &quot;Quem comprou, conta&quot; da tela /checkout. Aparecem os ativos, na ordem da lista, até {CHECKOUT_REVIEWS_LIMIT}.
          </p>
        </div>
        <div className="actions">
          <Link href="/admin/checkout" className="btn btn-ghost">
            <ArrowLeft size={16} aria-hidden="true" /> Personalizar checkout
          </Link>
          {editing ? (
            <Link href={BASE} className="btn btn-primary">
              <Plus size={16} aria-hidden="true" /> Novo comentário
            </Link>
          ) : null}
        </div>
      </div>

      <div className="cols-2 split">
        <div className="stack">
          <div className="callout warn cr-rule">
            Só comentários e fotos reais de clientes. Foto gerada por IA não entra como depoimento.
          </div>

          <section className="card">
            <div className="card-head">
              <h2>Comentários cadastrados</h2>
              <p>
                {reviews.length === 0
                  ? "Nenhum ainda."
                  : `${reviews.length} no total, ${activeTotal} ${activeTotal === 1 ? "ativo" : "ativos"}.`}
                {activeTotal > CHECKOUT_REVIEWS_LIMIT ? ` O checkout mostra só os ${CHECKOUT_REVIEWS_LIMIT} primeiros ativos.` : ""}
              </p>
            </div>

            {reviews.length === 0 ? (
              <p className="empty">Nenhum comentário cadastrado: o bloco de comentários não aparece no checkout. Use o formulário ao lado para adicionar o primeiro.</p>
            ) : (
              <ol className="cr-list">
                {reviews.map((review, index) => (
                  <li key={review.id} className={`cr-item${editing?.id === review.id ? " is-editing" : ""}`} data-review-id={review.id} data-active={review.active ? "true" : "false"}>
                    <div className="cr-order">
                      <ActionForm action={moveCheckoutReview} inline>
                        <input type="hidden" name="id" value={review.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button type="submit" className="btn btn-ghost btn-sm cr-icon-btn" aria-label={`Subir o comentário de ${review.author}`} disabled={index === 0}>
                          <ArrowUp size={14} aria-hidden="true" />
                        </button>
                      </ActionForm>
                      <ActionForm action={moveCheckoutReview} inline>
                        <input type="hidden" name="id" value={review.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button type="submit" className="btn btn-ghost btn-sm cr-icon-btn" aria-label={`Descer o comentário de ${review.author}`} disabled={index === reviews.length - 1}>
                          <ArrowDown size={14} aria-hidden="true" />
                        </button>
                      </ActionForm>
                    </div>

                    <div className="cr-body">
                      <div className="cr-line">
                        <strong className="cr-author">{review.author}</strong>
                        <Stars score={review.score} />
                        <span className={`badge ${review.active ? "tone-green" : "tone-gray"}`}>{review.active ? "Ativo" : "Desativado"}</span>
                      </div>
                      <p className="cr-excerpt">{review.comment}</p>
                      {review.images.length ? (
                        <div className="cr-thumbs">
                          {review.images.map((image, position) => (
                            <span key={image.id} className="cr-thumb">
                              <Image src={adminPhotoUrl(image.id)} alt={`Foto ${position + 1} enviada por ${review.author}`} width={44} height={44} unoptimized />
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="small muted">Sem foto</p>
                      )}
                      <div className="btn-row cr-actions">
                        <Link href={`${BASE}?editar=${review.id}`} className="btn btn-ghost btn-sm">
                          <Pencil size={14} aria-hidden="true" /> Editar
                        </Link>
                        <ActionForm action={setCheckoutReviewActive} inline>
                          <input type="hidden" name="id" value={review.id} />
                          <input type="hidden" name="active" value={review.active ? "0" : "1"} />
                          <button type="submit" className="btn btn-ghost btn-sm">
                            {review.active ? "Desativar" : "Ativar"}
                          </button>
                        </ActionForm>
                        <ActionForm action={deleteCheckoutReview} inline confirm={`Excluir o comentário de ${review.author}? As fotos dele saem junto e não dá para desfazer.`}>
                          <input type="hidden" name="id" value={review.id} />
                          <button type="submit" className="btn btn-ghost btn-sm danger">
                            <Trash2 size={14} aria-hidden="true" /> Excluir
                          </button>
                        </ActionForm>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="stack">
          {editing ? (
            <>
              <section className="card" key={`edit-${editing.id}`}>
                <div className="card-head">
                  <h2>Editar comentário</h2>
                  <p>De {editing.author}.</p>
                </div>
                {justCreated ? <div className="callout cr-rule">Comentário adicionado. Se o cliente mandou foto, envie logo abaixo.</div> : null}
                <ActionForm action={updateCheckoutReview}>
                  <input type="hidden" name="id" value={editing.id} />
                  <Fields review={editing} />
                  <div className="actions">
                    <button type="submit" className="btn btn-primary">
                      Salvar comentário
                    </button>
                  </div>
                </ActionForm>
              </section>

              <section className="card" key={`photos-${editing.id}`}>
                <div className="card-head">
                  <h2>Fotos do cliente</h2>
                  <p>Até {REVIEW_IMAGES_PER_REVIEW} por comentário. No checkout viram miniaturas que abrem a foto maior.</p>
                </div>
                <ReviewPhotos
                  reviewId={editing.id}
                  author={editing.author}
                  photos={editing.images.map((image) => ({ id: image.id, url: adminPhotoUrl(image.id), width: image.width, height: image.height }))}
                />
              </section>
            </>
          ) : (
            <section className="card" key="new">
              <div className="card-head">
                <h2>Novo comentário</h2>
                <p>Depois de salvar, a tela abre o comentário para você enviar as fotos.</p>
              </div>
              <ActionForm action={createCheckoutReview}>
                <Fields />
                <div className="actions">
                  <button type="submit" className="btn btn-primary">
                    Adicionar comentário
                  </button>
                </div>
              </ActionForm>
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <h2>Como aparece no checkout</h2>
              <p>Prévia do que está salvo e ativo agora. No checkout o bloco fica na coluna do resumo, em telas a partir de 1100 px.</p>
            </div>
            {shown.length === 0 ? (
              <p className="empty">Nenhum comentário ativo: o bloco não aparece no checkout.</p>
            ) : (
              <div className="cr-preview" style={themeVars(theme)}>
                <h3>Quem comprou, conta</h3>
                {shown.map((review) => (
                  <figure key={review.id}>
                    <Stars score={review.score} />
                    <blockquote>{review.comment}</blockquote>
                    {review.images.length ? (
                      <div className="cr-thumbs">
                        {review.images.map((image) => (
                          <span key={image.id} className="cr-thumb cr-thumb-ck">
                            <Image src={adminPhotoUrl(image.id)} alt={image.alt} width={56} height={56} unoptimized />
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <figcaption>
                      <span aria-hidden="true">{review.avatar}</span>
                      {review.author}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
