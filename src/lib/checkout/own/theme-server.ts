import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { companySettingKey, getCompanySetting } from "@/lib/settings";
import { themeDefaults, themeSchema, type Theme } from "./theme";

/** Atualiza apenas a campanha anterior ao ler um tema salvo; nenhuma escrita no banco. */
function currentCampaign(theme: Theme): Theme {
  const seasonal = /dia\s+das\s+crian[cç]as/i;
  const oldCampaign = seasonal.test(theme.bannerEyebrow) || seasonal.test(theme.timerLabel) || seasonal.test(theme.shipBarNote);
  const next = { ...theme, timerEnabled: false, timerLabel: themeDefaults.timerLabel };
  for (const field of ["shipBarText", "shipBarNote", "bannerEyebrow", "bannerTitle", "bannerSubtitle", "footerText", "badgeText"] as const) {
    if (seasonal.test(next[field])) next[field] = themeDefaults[field];
  }
  if (oldCampaign && theme.bannerTitle === "O presente para brincar junto.") next.bannerTitle = themeDefaults.bannerTitle;
  if (oldCampaign && theme.bannerSubtitle === "Mais água. Mais risadas. Mais momentos em família.") next.bannerSubtitle = themeDefaults.bannerSubtitle;
  // O frete é grátis e o FULL é opção paga da etapa de entrega: faixa e selo salvos não anunciam o FULL nem o preço dele.
  for (const field of ["shipBarText", "shipBarNote", "badgeText"] as const) {
    if (/frete\s+full/i.test(next[field]) || /^frete$/i.test(next[field].trim())) next[field] = themeDefaults[field];
  }
  return next;
}

/** Mesmo valor de DEFAULT_COMPANY_ID (db/schema.ts). */
const DEFAULT_COMPANY = "00000000-0000-4000-8000-000000000001";

/**
 * Base neutra de outra empresa (multiempresa, 2026-10-13): nada da identidade do AquaBlast. Nome da loja = nome da
 * empresa; razão social, CNPJ e endereço vazios (o rodapé esconde a linha); sem banner, sem cronômetro, sem frase de
 * rodapé. Cores e rótulos neutros seguem os padrões do checkout.
 */
export function neutralTheme(storeName: string): Theme {
  return themeSchema.parse({
    ...themeDefaults,
    storeName: storeName.trim().slice(0, 40) || "Loja",
    timerEnabled: false,
    timerLabel: "",
    bannerEnabled: false,
    bannerEyebrow: "",
    bannerTitle: "",
    bannerSubtitle: "",
    footerText: "",
    companyName: "",
    companyCnpj: "",
    companyAddress: "",
    pixReceiverName: "",
  });
}

/** Tema próprio gravado em `company:<id>:checkout.theme` (sem cair no global do AquaBlast). */
async function ownCompanyTheme(companyId: string): Promise<Record<string, unknown> | null> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, companySettingKey(companyId, "checkout.theme")) });
  const v = row?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Tema inválido usa os padrões. Personalizações sem conteúdo sazonal são preservadas.
 * `companyId` (multiempresa): outra empresa usa o próprio tema sobre a base neutra (`neutralTheme`), nunca o global;
 * sem ele (ou AquaBlast) lê o `checkout.theme` global, como antes.
 */
export async function getTheme(companyId?: string | null, companyName?: string): Promise<Theme> {
  if (companyId && companyId !== DEFAULT_COMPANY) {
    // Outra empresa: nunca herda o tema global (nome, CNPJ, endereço, banner do AquaBlast).
    const base = neutralTheme(companyName ?? "");
    const own = await ownCompanyTheme(companyId);
    if (!own) return base;
    const parsed = themeSchema.safeParse({ ...base, ...own });
    return parsed.success ? parsed.data : base;
  }
  const stored = await getCompanySetting(companyId, "checkout.theme");
  const parsed = themeSchema.safeParse({ ...themeDefaults, ...(stored ?? {}) });
  return currentCampaign(parsed.success ? parsed.data : themeSchema.parse({ ...themeDefaults }));
}
