// Tema do checkout (Fase 4.4): aparência e textos editáveis no painel (/admin/checkout).
// Arquivo PURO (zod + funções de cor): pode ser importado em componentes "use client".
// A leitura do banco fica em ./theme-server.ts (getTheme), para não puxar o Postgres para o navegador.
// Origem: ORIGEM/lib/theme.ts inteiro + blocos themeDefaults/themeSchema/safeImageUrl/validIsoDate de ORIGEM/lib/checkout.ts,
// adaptados de zod 3 para zod 4 (z.strictObject, { error }) e com as imagens em /checkout/... em vez de /images/...
import type { CSSProperties } from "react";
import { z } from "zod";

/** Cada campo tem padrão próprio, então registros antigos (ou vazios) continuam válidos. */
export const themeDefaults = {
  storeName: "AquaBlast",
  logoUrl: "",
  colorPrimary: "#063760",
  colorButton: "#06a64a",
  colorAccent: "#00aef0",
  colorTimer: "#d92d20",
  colorBackground: "#f4f5f7",
  timerEnabled: true,
  timerLabel: "Oferta Dia das Crianças termina em:",
  timerEnd: "2026-10-12T23:59:59-03:00",
  shipBarEnabled: true,
  shipBarText: "Frete FULL grátis para todo o Brasil",
  shipBarNote: "Dia das Crianças: envio rápido e postagem ágil",
  bannerEnabled: true,
  bannerEyebrow: "DIA DAS CRIANÇAS",
  bannerTitle: "O presente para brincar junto.",
  bannerSubtitle: "Mais água. Mais risadas. Mais momentos em família.",
  bannerImage: "/checkout/banner-immersive.webp",
  buttonLabel: "CONTINUAR",
  badgeText: "FRETE FULL GRÁTIS",
  footerText: "Momentos que viram boas lembranças.",
};

const hexColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, { error: "use uma cor no formato #RRGGBB (ex.: #06a64a)." });

const text = (max: number, min = 0) => {
  const s = z.string().trim();
  return (min ? s.min(min, { error: "este campo não pode ficar vazio." }) : s)
    .max(max, { error: `use no máximo ${max} caracteres.` })
    .refine((v) => !/[\u0000-\u001f\u007f<>]/.test(v), { error: "remova quebras de linha e os caracteres < >." });
};

/** Só aceita caminho local ("/checkout/x.webp", sem "//" nem "/\") ou https://. Bloqueia javascript:, data:, http: e caracteres que quebram CSS/HTML. */
export function safeImageUrl(v: string) {
  if (!v || v.length > 500 || /[\s"'()<>\\`]/.test(v)) return false;
  if (v.startsWith("/")) return !v.startsWith("//");
  if (!/^https:\/\//i.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

const imageUrl = (optional: boolean) =>
  z
    .string()
    .trim()
    .max(500, { error: "use no máximo 500 caracteres." })
    .refine((v) => (optional && v === "") || safeImageUrl(v), {
      error: optional
        ? "use um caminho do site começando com / ou um endereço https:// (ou deixe vazio)."
        : "use um caminho do site começando com / ou um endereço https://.",
    });

/** ISO 8601 com fuso obrigatório (ex.: 2026-10-12T23:59:59-03:00) e data de calendário real (rejeita 31/02). */
export function validIsoDate(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/.exec(v);
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const se = Number(m[6] ?? 0);
  if (Number(m[8] ?? 0) > 14 || Number(m[9] ?? 0) > 59 || h > 23 || mi > 59 || se > 59) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && !Number.isNaN(Date.parse(v));
}

const flag = (v: boolean) => z.boolean({ error: "use verdadeiro ou falso." }).default(v);

export const themeSchema = z.strictObject({
  storeName: text(40, 1).default(themeDefaults.storeName),
  logoUrl: imageUrl(true).default(themeDefaults.logoUrl),
  colorPrimary: hexColor.default(themeDefaults.colorPrimary),
  colorButton: hexColor.default(themeDefaults.colorButton),
  colorAccent: hexColor.default(themeDefaults.colorAccent),
  colorTimer: hexColor.default(themeDefaults.colorTimer),
  colorBackground: hexColor.default(themeDefaults.colorBackground),
  timerEnabled: flag(themeDefaults.timerEnabled),
  timerLabel: text(80).default(themeDefaults.timerLabel),
  timerEnd: z
    .string()
    .trim()
    .refine(validIsoDate, { error: "informe uma data e hora válidas no formato ISO com fuso (ex.: 2026-10-12T23:59:59-03:00)." })
    .default(themeDefaults.timerEnd),
  shipBarEnabled: flag(themeDefaults.shipBarEnabled),
  shipBarText: text(80).default(themeDefaults.shipBarText),
  shipBarNote: text(100).default(themeDefaults.shipBarNote),
  bannerEnabled: flag(themeDefaults.bannerEnabled),
  bannerEyebrow: text(40).default(themeDefaults.bannerEyebrow),
  bannerTitle: text(80).default(themeDefaults.bannerTitle),
  bannerSubtitle: text(120).default(themeDefaults.bannerSubtitle),
  bannerImage: imageUrl(false).default(themeDefaults.bannerImage),
  buttonLabel: text(30, 1).default(themeDefaults.buttonLabel),
  badgeText: text(30).default(themeDefaults.badgeText),
  footerText: text(120).default(themeDefaults.footerText),
});

export type Theme = z.infer<typeof themeSchema>;

/** Nomes amigáveis de cada campo do tema, usados nas mensagens de erro do painel. */
export const themeFieldLabels: Record<keyof Theme, string> = {
  storeName: "Nome da loja",
  logoUrl: "Endereço do logotipo",
  colorPrimary: "Cor principal",
  colorButton: "Cor do botão",
  colorAccent: "Cor de destaque",
  colorTimer: "Cor do cronômetro",
  colorBackground: "Cor de fundo",
  timerEnabled: "Mostrar cronômetro",
  timerLabel: "Texto do cronômetro",
  timerEnd: "Fim da oferta",
  shipBarEnabled: "Mostrar faixa de frete",
  shipBarText: "Texto da faixa de frete",
  shipBarNote: "Observação da faixa de frete",
  bannerEnabled: "Mostrar banner",
  bannerEyebrow: "Chamada do banner",
  bannerTitle: "Título do banner",
  bannerSubtitle: "Subtítulo do banner",
  bannerImage: "Imagem do banner",
  buttonLabel: "Texto do botão",
  badgeText: "Selo da etapa",
  footerText: "Texto do rodapé",
};

/** Converte o primeiro erro do zod numa mensagem em pt-BR que diz qual campo do tema está inválido. */
export function describeThemeError(error: z.ZodError): { field: string; message: string } {
  const issue = error.issues[0];
  if (!issue) return { field: "", message: "Dados inválidos." };
  const field = issue.path.map(String).join(".");
  const key = String(issue.path[issue.path.length - 1] ?? "") as keyof Theme;
  if (issue.code === "unrecognized_keys") {
    return { field: [field, issue.keys[0]].filter(Boolean).join("."), message: `Campo não reconhecido: ${issue.keys.join(", ")}.` };
  }
  const label = themeFieldLabels[key] ?? (field || "Aparência");
  let detail = issue.message;
  if (issue.code === "invalid_type") detail = issue.input === undefined ? "campo obrigatório ausente." : "tipo de valor inválido.";
  return { field, message: `${label}: ${detail}` };
}

// ---------- Utilitários puros de cor e tempo (ORIGEM/lib/theme.ts) ----------

export type ThemeColors = Pick<Theme, "colorPrimary" | "colorButton" | "colorAccent" | "colorTimer" | "colorBackground">;
export type TimeLeft = { days: number; hours: number; minutes: number; seconds: number };

/** Texto escuro usado quando o branco não dá contraste suficiente. */
export const darkText = "#0b1f33";
export const lightText = "#ffffff";

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: number[]) => "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");

/** Luminância relativa WCAG 2.x (0 = preto, 1 = branco). Cor inválida conta como preto. */
export function luminance(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores #RRGGBB (1 a 21). */
export function contrastRatio(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Escurece a cor misturando com preto (amount 0.12 = 12% mais escura). */
export function darken(hex: string, amount = 0.12) {
  const rgb = hexToRgb(hex);
  return rgb ? toHex(rgb.map((c) => c * (1 - amount))) : hex;
}

/** Branco ou #0b1f33, o que tiver melhor contraste sobre o fundo. */
export function readableOn(bg: string): typeof lightText | typeof darkText {
  return contrastRatio(bg, lightText) >= contrastRatio(bg, darkText) ? lightText : darkText;
}

/** Variáveis CSS do tema, para usar em `style={themeVars(theme)}` num elemento raiz. */
export function themeVars(theme: ThemeColors): CSSProperties {
  return {
    "--c-primary": theme.colorPrimary,
    "--c-button": theme.colorButton,
    "--c-button-hover": darken(theme.colorButton, 0.12),
    "--c-accent": theme.colorAccent,
    "--c-timer": theme.colorTimer,
    "--c-bg": theme.colorBackground,
    "--c-on-button": readableOn(theme.colorButton),
    "--c-on-primary": readableOn(theme.colorPrimary),
    "--c-on-timer": readableOn(theme.colorTimer),
  } as CSSProperties;
}

/** Tempo restante até `endIso`. Devolve null se a data for inválida ou já tiver passado. */
export function timeLeft(endIso: string, now: number | Date = Date.now()): TimeLeft | null {
  const end = Date.parse(endIso);
  const t = typeof now === "number" ? now : now.getTime();
  if (Number.isNaN(end) || Number.isNaN(t)) return null;
  const diff = Math.floor((end - t) / 1000);
  if (diff <= 0) return null;
  return { days: Math.floor(diff / 86400), hours: Math.floor(diff / 3600) % 24, minutes: Math.floor(diff / 60) % 60, seconds: diff % 60 };
}

/** Fuso fixo de Brasília (sem horário de verão desde 2019). */
export const storeOffset = "-03:00";

/** ISO com fuso -> valor de `<input type="datetime-local" step={1}>` no horário de Brasília ("2026-10-12T23:59:59"). */
export function isoToLocalInput(iso: string) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t - 3 * 3600_000).toISOString().slice(0, 19);
}

/** Valor de `<input type="datetime-local">` -> ISO com fuso -03:00. Devolve '' se o valor não for reconhecido. */
export function localInputToIso(value: string) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/.exec(value);
  return m ? `${m[1]}${m[2] ?? ":00"}${storeOffset}` : "";
}
