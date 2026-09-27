import { getSetting } from "@/lib/settings";
import { themeDefaults, themeSchema, type Theme } from "./theme";

/**
 * Lê o tema gravado no painel (setting `checkout.theme`) e aplica os padrões.
 * Só servidor (lê o banco). Tema corrompido nunca derruba o checkout: cai nos padrões.
 */
export async function getTheme(): Promise<Theme> {
  const stored = await getSetting("checkout.theme");
  const parsed = themeSchema.safeParse({ ...themeDefaults, ...(stored ?? {}) });
  return parsed.success ? parsed.data : themeSchema.parse({ ...themeDefaults });
}
