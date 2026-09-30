"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { actorOf, audit } from "@/lib/admin/audit";
import { str } from "@/lib/admin/form";
import { FIELD_INTEGRATION, INTEGRATION_PAGE, runVerification } from "@/lib/admin/integrations/verify";
import { fail, ok, type ActionResult } from "@/lib/admin/types";

/**
 * Botão "Verificar" do SecretField e "Verificar conexão" do e-mail (pedido 2026-09-30, etapa D).
 * O FormData traz só `field` (nome do campo, ex. "ads.meta.accessToken", ou "email"). Verifica o valor SALVO,
 * grava integrations.status e revalida a tela para o selo atualizar.
 */
export async function verifyIntegrationAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  await ensureBootstrap();
  const actor = actorOf(session);
  const field = str(fd, "field", 80) as keyof typeof FIELD_INTEGRATION;
  const key = FIELD_INTEGRATION[field];
  if (!key) return fail("Esta integração não tem teste disponível.");
  const r = await runVerification(key, actor);
  await audit(actor, "integration.verify", { type: "integration", id: key }, { ok: r.ok });
  revalidatePath(INTEGRATION_PAGE[key]);
  return r.ok ? ok(`Conectado: ${r.message}.`) : fail(`Falhou: ${r.message}`);
}
