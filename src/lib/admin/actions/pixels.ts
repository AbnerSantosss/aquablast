"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { actorOf, audit } from "@/lib/admin/audit";
import { bool, str } from "@/lib/admin/form";
import { rejectPanelPassword } from "@/lib/admin/secret-guard";
import { fail, ok, type ActionResult } from "@/lib/admin/types";
import { headers } from "next/headers";
import { clientIp } from "@/lib/rate-limit";
import { getSetting, isSecretKey, META_SERVER_EVENTS, setSetting, type SettingKey, type SettingsMap } from "@/lib/settings";
import { refreshIntegration, runVerification } from "@/lib/admin/integrations/verify";
import { orderItemOf } from "@/lib/checkout/own/catalog";
import { sendMetaTestEvents } from "@/lib/tracking-ads/meta-capi";
import { ga4TestInputs, validateGa4Event } from "@/lib/tracking-ads/ga4-mp";
import { AD_EVENT_FUNNEL, isAdEventName, type AdEventName, type AdTestSample } from "@/lib/tracking-ads/types";

/**
 * Ações da tela Pixels (fase 11.10): Meta Conversions API e GA4 Measurement Protocol.
 * Os dois são enviados do servidor (sem GTM no painel nem no /checkout próprio).
 */

type Patch = Partial<SettingsMap>;

async function begin() {
  const session = await requireAdmin();
  await ensureBootstrap();
  return { adminId: session.sub, actor: actorOf(session) };
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
  const { adminId, actor } = await begin();
  const pixelId = str(fd, "ads.meta.pixelId", 40);
  const accessToken = str(fd, "ads.meta.accessToken", 500);
  const testEventCode = str(fd, "ads.meta.testEventCode", 60);
  if (pixelId && !/^\d{5,25}$/.test(pixelId)) return fail("ID do Pixel inválido (só números).");
  const guard = await rejectPanelPassword(adminId, { "Token de acesso": accessToken, "Código de evento de teste": testEventCode });
  if (guard) return fail(guard);
  if (accessToken && !/^EAA[A-Za-z0-9]{20,}$/.test(accessToken)) {
    return fail("Token de acesso inválido: o token da Meta começa com EAA e não tem espaços. O token salvo foi mantido.");
  }
  if (testEventCode && !/^[A-Za-z0-9]{3,60}$/.test(testEventCode)) return fail("Código de evento de teste inválido (formato TEST12345).");
  const testMode = bool(fd, "ads.meta.testMode");
  if (testMode && !testEventCode) return fail("Para enviar como evento de teste, preencha o código de evento de teste.");
  // Checkboxes "Eventos que o site envia": ausente = desmarcado. Só os três que o servidor conhece.
  const events = META_SERVER_EVENTS.filter((e) => fd.getAll("ads.meta.events").includes(e));
  const before = await getSetting("ads.meta.pixelId");
  await apply(actor, "ads.meta", {
    "ads.meta.enabled": bool(fd, "ads.meta.enabled"),
    "ads.meta.pixelId": pixelId,
    "ads.meta.accessToken": accessToken,
    "ads.meta.testEventCode": testEventCode,
    "ads.meta.testMode": testMode,
    "ads.meta.events": events,
  });
  // Com pixel preenchido, todo salvar testa o token (GET do pixel, sem enviar evento) e diz o estado dele.
  // Pedido do dono (2026-09-30): a mensagem fixa "Token em branco é mantido" confundia; ele quer ver se o
  // token está ativo. Campo do token vazio continua mantendo o token salvo (não apaga).
  const changed = Boolean(accessToken) || before.trim() !== pixelId;
  const tokenStatus = pixelId ? await metaTokenStatus(actor) : await refreshIntegration("meta", actor, { changed, verify: false });
  const warn = testMode ? " Atenção: modo teste ligado, os eventos reais vão para Eventos de teste. Desmarque ao terminar." : "";
  const none = events.length ? "" : " Nenhum evento marcado: o site não envia nada para a Meta.";
  return ok(`Configurações da Meta salvas.${tokenStatus}${warn}${none}`);
}

/** Testa o token salvo e devolve a frase para o dono. Nunca contém o token. */
async function metaTokenStatus(actor: string): Promise<string> {
  const r = await runVerification("meta", actor);
  if (r.ok) return ` Token ativo e funcionando: ${r.message}.`;
  if (r.message === "token não configurado") return " Falta colar o token de acesso.";
  if (/^(Meta recusou|o envio também falhou|o token não pode ler)/.test(r.message)) return ` O token não funcionou: ${r.message}.`;
  return ` Token salvo, mas não foi possível falar com a Meta agora: ${r.message}.`;
}

export async function saveGa4Settings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { adminId, actor } = await begin();
  const measurementId = str(fd, "ads.ga4.measurementId", 40);
  const apiSecret = str(fd, "ads.ga4.apiSecret", 500);
  if (measurementId && !/^G-[A-Z0-9]{4,20}$/i.test(measurementId)) return fail("ID de medição inválido (formato G-XXXXXXX).");
  const guard = await rejectPanelPassword(adminId, { "Segredo da API": apiSecret });
  if (guard) return fail(guard);
  if (apiSecret && !/^[A-Za-z0-9_-]{10,100}$/.test(apiSecret)) {
    return fail("Segredo da API inválido: copie o valor do GA4 (Fluxo de dados → Segredos da API do Measurement Protocol). O segredo salvo foi mantido.");
  }
  await apply(actor, "ads.ga4", {
    "ads.ga4.enabled": bool(fd, "ads.ga4.enabled"),
    "ads.ga4.measurementId": measurementId,
    "ads.ga4.apiSecret": apiSecret,
  });
  return ok("Configurações do GA4 salvas. O segredo em branco foi mantido.");
}

export async function saveConsentSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  await apply(actor, "ads.consent", { "ads.consentRequired": bool(fd, "ads.consentRequired") });
  return ok("Configuração de consentimento salva.");
}

/** Campo "event" dos formulários de teste: "all" = a sequência do funil inteira; senão um evento só. */
function chosenEvents(fd: FormData): readonly AdEventName[] | null {
  const v = str(fd, "event", 40) || "all";
  if (v === "all") return AD_EVENT_FUNNEL;
  return isAdEventName(v) ? [v] : null;
}

/** Produto real do catálogo (1 unidade azul, preço do Pix salvo no painel) com pedido fictício. */
async function testSample(): Promise<AdTestSample> {
  const prices = await getSetting("checkout.prices");
  const priceCents = prices.unit.pix;
  const item = orderItemOf({ pack: "unit", colors: ["azul"] }, priceCents);
  return { runId: Date.now().toString(36), sku: item.sku, name: item.name, variant: item.variant, priceCents };
}

export async function sendMetaTest(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await begin();
  const events = chosenEvents(fd);
  if (!events) return fail("Evento de teste inválido.");
  const testEventCode = str(fd, "testEventCode", 60) || undefined;
  const h = await headers();
  const r = await sendMetaTestEvents({
    events,
    sample: await testSample(),
    clientIp: clientIp(h) || undefined,
    userAgent: h.get("user-agent") ?? undefined,
    testEventCode,
  });
  return r.ok ? ok(r.detail ?? "Eventos de teste enviados à Meta.") : fail(r.detail ?? "Falha ao enviar os eventos de teste.");
}

export async function sendGa4Test(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await begin();
  const events = chosenEvents(fd);
  if (!events) return fail("Evento de teste inválido.");
  const r = await validateGa4Event(ga4TestInputs(events, await testSample()));
  const names = events.join(" → ");
  return r.ok ? ok(`${names}: ${r.detail ?? "validado pelo GA4."}`) : fail(`${names}: ${r.detail ?? "o GA4 encontrou problemas."}`);
}
