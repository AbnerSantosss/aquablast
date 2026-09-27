"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { actorOf, audit } from "@/lib/admin/audit";
import { bool, str } from "@/lib/admin/form";
import { fail, ok, type ActionResult } from "@/lib/admin/types";
import { headers } from "next/headers";
import { isSecretKey, setSetting, type SettingKey, type SettingsMap } from "@/lib/settings";
import { sendMetaTestEvent } from "@/lib/tracking-ads/meta-capi";
import { validateGa4Event } from "@/lib/tracking-ads/ga4-mp";

/**
 * Ações da tela Pixels (fase 11.10): Meta Conversions API e GA4 Measurement Protocol.
 * Os dois são enviados do servidor (sem GTM no painel nem no /checkout próprio).
 */

type Patch = Partial<SettingsMap>;

async function begin() {
  const session = await requireAdmin();
  await ensureBootstrap();
  return { actor: actorOf(session) };
}

async function apply(actor: string, section: string, patch: Patch): Promise<void> {
  const changed: string[] = [];
  for (const [k, v] of Object.entries(patch) as [SettingKey, SettingsMap[SettingKey]][]) {
    if (isSecretKey(k) && (v === "" || v === undefined || v === null)) continue;
    await setSetting(k, v as never, actor);
    changed.push(k);
  }
  await audit(actor, "settings.update", { type: "settings", id: section }, { keys: changed });
  revalidatePath("/admin/pixels");
}

export async function saveMetaSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const pixelId = str(fd, "ads.meta.pixelId", 40);
  if (pixelId && !/^\d{5,25}$/.test(pixelId)) return fail("ID do Pixel inválido (só números).");
  await apply(actor, "ads.meta", {
    "ads.meta.enabled": bool(fd, "ads.meta.enabled"),
    "ads.meta.pixelId": pixelId,
    "ads.meta.accessToken": str(fd, "ads.meta.accessToken", 500),
    "ads.meta.testEventCode": str(fd, "ads.meta.testEventCode", 60),
  });
  return ok("Configurações da Meta salvas. O token em branco foi mantido.");
}

export async function saveGa4Settings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const measurementId = str(fd, "ads.ga4.measurementId", 40);
  if (measurementId && !/^G-[A-Z0-9]{4,20}$/i.test(measurementId)) return fail("ID de medição inválido (formato G-XXXXXXX).");
  await apply(actor, "ads.ga4", {
    "ads.ga4.enabled": bool(fd, "ads.ga4.enabled"),
    "ads.ga4.measurementId": measurementId,
    "ads.ga4.apiSecret": str(fd, "ads.ga4.apiSecret", 500),
  });
  return ok("Configurações do GA4 salvas. O segredo em branco foi mantido.");
}

export async function saveConsentSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  await apply(actor, "ads.consent", { "ads.consentRequired": bool(fd, "ads.consentRequired") });
  return ok("Configuração de consentimento salva.");
}

export async function sendMetaTest(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await begin();
  const testEventCode = str(fd, "testEventCode", 60) || undefined;
  const h = await headers();
  const userAgent = h.get("user-agent") ?? undefined;
  const r = await sendMetaTestEvent({ userAgent, testEventCode });
  return r.ok ? ok(r.detail ?? "Evento de teste enviado à Meta.") : fail(r.detail ?? "Falha ao enviar o evento de teste.");
}

export async function sendGa4Test(): Promise<ActionResult> {
  await begin();
  const r = await validateGa4Event();
  return r.ok ? ok(r.detail ?? "Evento de teste validado pelo GA4.") : fail(r.detail ?? "O GA4 encontrou problemas no evento de teste.");
}
