"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { actorOf, audit } from "@/lib/admin/audit";
import { bool, int, str } from "@/lib/admin/form";
import { fail, ok, type ActionResult } from "@/lib/admin/types";
import { describeThemeError, localInputToIso, themeDefaults, themeSchema } from "@/lib/checkout/own/theme";
import { setSetting } from "@/lib/settings";

/**
 * Ações da tela Personalizar checkout (fase 11.9): aparência/textos (`checkout.theme`, validado por
 * `themeSchema`) e a recuperação de carrinho abandonado (`checkout.recovery.*`).
 */

async function begin() {
  const session = await requireAdmin();
  await ensureBootstrap();
  return { actor: actorOf(session) };
}

export async function saveThemeSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const input: Record<string, unknown> = {};
  for (const key of Object.keys(themeDefaults)) {
    const def = themeDefaults[key as keyof typeof themeDefaults];
    if (typeof def === "boolean") input[key] = bool(fd, key);
    else input[key] = str(fd, key, 500);
  }
  // O campo vem de <input type="datetime-local"> (horário de Brasília); themeSchema espera ISO com fuso.
  input.timerEnd = localInputToIso(str(fd, "timerEnd", 40)) || input.timerEnd;
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) {
    const { field, message } = describeThemeError(parsed.error);
    return fail(message, field ? { fields: { [field]: message } } : {});
  }
  await setSetting("checkout.theme", parsed.data, actor);
  await audit(actor, "settings.update", { type: "settings", id: "checkout.theme" }, { keys: ["checkout.theme"] });
  revalidatePath("/admin/checkout");
  revalidatePath("/checkout");
  return ok("Aparência do checkout salva.");
}

export async function saveRecoverySettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const enabled = bool(fd, "checkout.recovery.enabled");
  const first = int(fd, "checkout.recovery.firstAfterMinutes", 30, 1, 60 * 24 * 30);
  const second = int(fd, "checkout.recovery.secondAfterMinutes", 1440, 1, 60 * 24 * 60);
  const third = int(fd, "checkout.recovery.thirdAfterMinutes", 4320, 1, 60 * 24 * 90);
  if (!(first < second && second < third)) {
    return fail("Os prazos precisam ser crescentes: 1º lembrete < 2º lembrete < 3º lembrete.");
  }
  await setSetting("checkout.recovery.enabled", enabled, actor);
  await setSetting("checkout.recovery.firstAfterMinutes", first, actor);
  await setSetting("checkout.recovery.secondAfterMinutes", second, actor);
  await setSetting("checkout.recovery.thirdAfterMinutes", third, actor);
  await audit(actor, "settings.update", { type: "settings", id: "checkout.recovery" }, {
    keys: ["checkout.recovery.enabled", "checkout.recovery.firstAfterMinutes", "checkout.recovery.secondAfterMinutes", "checkout.recovery.thirdAfterMinutes"],
  });
  revalidatePath("/admin/checkout");
  return ok("Recuperação de carrinho abandonado salva.");
}
