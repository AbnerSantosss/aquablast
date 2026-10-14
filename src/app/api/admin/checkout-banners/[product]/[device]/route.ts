import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { checkoutBanners, DEFAULT_COMPANY_ID } from "@/db/schema";
import { adminGuard } from "@/app/api/admin/_lib/guard";
import { fail, json, originAllowed, readJson } from "@/app/api/checkout/_lib/http";
import { actorOf, audit } from "@/lib/admin/audit";
import { ensureBootstrap } from "@/lib/bootstrap";
import { BANNER_ALT_MAX, bannerDefaultAlt, bannerImageUrl, isBannerDevice, isBannerProduct, type BannerDevice, type BannerProduct } from "@/lib/checkout/own/banners";
import { BANNER_IMAGE_MAX_BYTES, bannerTooBigMessage, checkBannerImage } from "@/lib/checkout/own/banners-image";
import { errorMessage, log } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Folga para o envelope multipart (limites, nomes dos campos, descrição). */
const ENVELOPE_BYTES = 64 * 1024;
/** Teto do corpo inteiro: acima disso nem se lê o arquivo. */
const BODY_LIMIT = BANNER_IMAGE_MAX_BYTES + ENVELOPE_BYTES;
const NOT_FOUND = "Espaço de banner não encontrado. Atualize a página.";

type Slot = { product: BannerProduct; device: BannerDevice };
type Ctx = { params: Promise<{ product: string; device: string }> };

/** Produto e dispositivo só valem se estiverem nas listas de banners.ts. Fora delas: 404. */
async function slotOf(ctx: Ctx): Promise<Slot | null> {
  const { product, device } = await ctx.params;
  return isBannerProduct(product) && isBannerDevice(device) ? { product, device } : null;
}

type AltResult = { ok: true; alt: string } | { ok: false; message: string };

/** Descrição da imagem (texto alternativo): uma linha, sem caractere de controle, até 120 caracteres. */
function cleanAlt(raw: unknown): AltResult {
  if (typeof raw !== "string") return { ok: false, message: "A descrição da imagem chegou em formato inválido. Escreva de novo e salve." };
  const alt = raw
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const length = Array.from(alt).length;
  if (length > BANNER_ALT_MAX) return { ok: false, message: `A descrição da imagem tem ${length} caracteres; o limite é ${BANNER_ALT_MAX}. Encurte e salve de novo.` };
  return { ok: true, alt };
}

/** Rota do painel do AquaBlast: sempre a empresa padrão (multiempresa, 0013). */
const whereSlot = (slot: Slot) => and(eq(checkoutBanners.companyId, DEFAULT_COMPANY_ID), eq(checkoutBanners.product, slot.product), eq(checkoutBanners.device, slot.device));

function revalidate(): void {
  revalidatePath("/checkout");
  revalidatePath("/admin/checkout");
}

/**
 * Envia (ou troca) a arte do banner de um produto em um dispositivo: multipart com o campo `file` e,
 * opcional, `alt` (descrição da imagem). Sem `alt` no envio, a troca mantém a descrição que já estava.
 * Route Handler e não Server Action de propósito: as actions têm teto global de 1 MB no corpo; aqui o
 * limite é só desta rota e a recusa volta com a causa escrita.
 * Trocar apaga a linha antiga e insere outra na mesma transação: o id muda, a URL pública muda e o cache
 * longo do navegador não segura a arte antiga.
 */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  const slot = await slotOf(ctx);
  if (!slot) return fail(404, NOT_FOUND);

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > BODY_LIMIT) return fail(413, bannerTooBigMessage(declared));

  let file: File | null = null;
  let altEntry: FormDataEntryValue | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
    altEntry = form.get("alt");
  } catch {
    return fail(400, "O envio chegou incompleto. Tente de novo.");
  }
  if (!file) return fail(400, "Nenhum arquivo chegou. Escolha a arte de novo.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkBannerImage(bytes);
  if (!check.ok) return fail(bytes.length > BANNER_IMAGE_MAX_BYTES ? 413 : 400, check.message);

  let sentAlt: string | null = null;
  if (altEntry !== null) {
    const cleaned = cleanAlt(altEntry);
    if (!cleaned.ok) return fail(400, cleaned.message);
    sentAlt = cleaned.alt;
  }

  try {
    await ensureBootstrap();
    const result = await db.transaction(async (tx) => {
      const [removed] = await tx.delete(checkoutBanners).where(whereSlot(slot)).returning({ id: checkoutBanners.id, alt: checkoutBanners.alt });
      const alt = sentAlt ?? removed?.alt ?? "";
      const [created] = await tx
        .insert(checkoutBanners)
        .values({ companyId: DEFAULT_COMPANY_ID, product: slot.product, device: slot.device, alt, mime: check.info.mime, width: check.info.width, height: check.info.height, bytes: Buffer.from(bytes) })
        .returning({ id: checkoutBanners.id });
      return { id: created.id, alt, replacedId: removed?.id ?? null };
    });
    await audit(
      actorOf(guard.session),
      "checkout_banner.upload",
      { type: "checkout_banner", id: result.id },
      { product: slot.product, device: slot.device, replacedId: result.replacedId, mime: check.info.mime, width: check.info.width, height: check.info.height, bytes: bytes.length },
    );
    revalidate();
    return json({
      ok: true,
      replaced: result.replacedId !== null,
      customAlt: result.alt,
      banner: {
        id: result.id,
        url: bannerImageUrl(result.id),
        product: slot.product,
        device: slot.device,
        mime: check.info.mime,
        width: check.info.width,
        height: check.info.height,
        alt: result.alt || bannerDefaultAlt(slot.product),
      },
    });
  } catch (err) {
    log.error("admin: envio de arte de banner falhou", { ...slot, error: errorMessage(err) });
    return fail(500, "Não deu para gravar a arte agora. Tente de novo em instantes.");
  }
}

/** Grava só a descrição da imagem (JSON `{ alt }`) da arte que já está no espaço, sem reenviar o arquivo. */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  const slot = await slotOf(ctx);
  if (!slot) return fail(404, NOT_FOUND);

  const body = await readJson(request, 4096);
  if (!body.ok) return body.response;
  const raw = body.data && typeof body.data === "object" && "alt" in body.data ? body.data.alt : undefined;
  const cleaned = cleanAlt(raw);
  if (!cleaned.ok) return fail(400, cleaned.message);

  try {
    await ensureBootstrap();
    const [updated] = await db.update(checkoutBanners).set({ alt: cleaned.alt }).where(whereSlot(slot)).returning({ id: checkoutBanners.id });
    if (!updated) return fail(404, "Este espaço está sem arte. Envie a arte antes de gravar a descrição.");
    await audit(actorOf(guard.session), "checkout_banner.alt", { type: "checkout_banner", id: updated.id }, { product: slot.product, device: slot.device, alt: cleaned.alt });
    revalidate();
    return json({ ok: true, customAlt: cleaned.alt, alt: cleaned.alt || bannerDefaultAlt(slot.product) });
  } catch (err) {
    log.error("admin: descrição de arte de banner falhou", { ...slot, error: errorMessage(err) });
    return fail(500, "Não deu para gravar a descrição agora. Tente de novo em instantes.");
  }
}

/** Remove a arte de um produto em um dispositivo. O checkout volta ao que mostra sem arte. */
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  const slot = await slotOf(ctx);
  if (!slot) return fail(404, NOT_FOUND);

  try {
    await ensureBootstrap();
    const [removed] = await db.delete(checkoutBanners).where(whereSlot(slot)).returning({ id: checkoutBanners.id });
    if (!removed) return fail(404, "Este espaço já está sem arte. Atualize a página.");
    await audit(actorOf(guard.session), "checkout_banner.remove", { type: "checkout_banner", id: removed.id }, { product: slot.product, device: slot.device });
    revalidate();
    return json({ ok: true });
  } catch (err) {
    log.error("admin: remoção de arte de banner falhou", { ...slot, error: errorMessage(err) });
    return fail(500, "Não deu para remover a arte agora. Tente de novo em instantes.");
  }
}
