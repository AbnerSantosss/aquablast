"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { actorOf, audit } from "@/lib/admin/audit";
import { bool, int } from "@/lib/admin/form";
import { fail, ok, type ActionResult } from "@/lib/admin/types";
import { setSetting, type SettingsMap } from "@/lib/settings";

/**
 * Ações da tela Produtos (fase 11.7): preços do checkout próprio (`checkout.prices`, em centavos),
 * parcelamento máximo (`checkout.maxInstallments`) e o order bump (`checkout.bumpEnabled`).
 * Não inventa números: quem decide os valores é o dono, aqui só valida (Pix < cartão, mínimos/máximos razoáveis).
 */

/** A página de vendas e o /llms.txt mostram estes mesmos valores (lib/site/prices-server.ts): refaz os dois ao salvar. */
function revalidateSitePrices() {
  revalidatePath("/");
  revalidatePath("/llms.txt");
}

async function begin() {
  const session = await requireAdmin();
  await ensureBootstrap();
  return { actor: actorOf(session) };
}

/** Lê um preço em reais do formulário (ex.: "159,90" ou "159.90") e devolve centavos, ou null se inválido. */
function centsField(fd: FormData, name: string): number | null {
  const raw = fd.get(name);
  if (typeof raw !== "string" || !raw.trim()) return null;
  const n = Number(raw.trim().replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export async function savePricesSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();

  const unitPix = centsField(fd, "unitPix");
  const unitCard = centsField(fd, "unitCard");
  const kitPix = centsField(fd, "kitPix");
  const kitCard = centsField(fd, "kitCard");
  if (unitPix === null || unitCard === null || kitPix === null || kitCard === null) {
    return fail("Preencha os quatro preços com valores válidos (ex.: 159,90).");
  }
  if (unitPix > unitCard) return fail("O preço no Pix da unidade não pode ser maior que no cartão.");
  if (kitPix > kitCard) return fail("O preço no Pix do kit não pode ser maior que no cartão.");
  if (kitPix < unitPix || kitCard < unitCard) return fail("O preço do kit não pode ser menor que o da unidade.");
  // Limite generoso só para pegar erro de digitação (ex.: casa decimal a mais), não uma regra de negócio.
  if (unitCard > 500_000 || kitCard > 800_000) return fail("Valor muito alto — confira se não faltou uma vírgula.");

  const prices: SettingsMap["checkout.prices"] = {
    unit: { pix: unitPix, card: unitCard },
    kit: { pix: kitPix, card: kitCard },
  };
  await setSetting("checkout.prices", prices, actor);
  await audit(actor, "settings.update", { type: "settings", id: "checkout.prices" }, { keys: ["checkout.prices"] });
  revalidatePath("/admin/produtos");
  revalidateSitePrices();
  return ok("Preços salvos.");
}

export async function saveInstallmentsSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const max = int(fd, "maxInstallments", 12, 1, 12);
  await setSetting("checkout.maxInstallments", max, actor);
  await audit(actor, "settings.update", { type: "settings", id: "checkout.maxInstallments" }, { keys: ["checkout.maxInstallments"] });
  revalidatePath("/admin/produtos");
  revalidateSitePrices();
  return ok("Parcelamento máximo salvo.");
}

export async function saveBumpSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const enabled = bool(fd, "bumpEnabled");
  await setSetting("checkout.bumpEnabled", enabled, actor);
  await audit(actor, "settings.update", { type: "settings", id: "checkout.bumpEnabled" }, { keys: ["checkout.bumpEnabled"] });
  revalidatePath("/admin/produtos");
  return ok(enabled ? "Order bump ativado." : "Order bump desativado.");
}
