import { getSetting } from "@/lib/settings";
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
  // A oferta atual cobra FULL na unidade; temas antigos não podem prometer gratuidade irrestrita.
  for (const field of ["shipBarText", "shipBarNote", "badgeText"] as const) {
    if (/frete(?:\s+full)?\s+gr[aá]tis/i.test(next[field]) || /^frete$/i.test(next[field].trim())) next[field] = themeDefaults[field];
  }
  return next;
}

/** Tema inválido usa os padrões. Personalizações sem conteúdo sazonal são preservadas. */
export async function getTheme(): Promise<Theme> {
  const stored = await getSetting("checkout.theme");
  const parsed = themeSchema.safeParse({ ...themeDefaults, ...(stored ?? {}) });
  return currentCampaign(parsed.success ? parsed.data : themeSchema.parse({ ...themeDefaults }));
}
