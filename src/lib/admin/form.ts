/** Leitura defensiva de FormData: tudo que chega do cliente é não confiável. */
export function str(fd: FormData, name: string, max = 2000): string {
  const v = fd.get(name);
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export function optStr(fd: FormData, name: string, max = 2000): string | null {
  const v = str(fd, name, max);
  return v === "" ? null : v;
}

export function num(fd: FormData, name: string): number | null {
  const v = str(fd, name, 50);
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function int(fd: FormData, name: string, fallback: number, min = 0, max = 1_000_000): number {
  const n = num(fd, name);
  if (n === null) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "1";
}

export function uuid(fd: FormData, name: string): string | null {
  const v = str(fd, name, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
}

/** Aceita JSON ({"campo":"a.b"}) ou linhas `campo=caminho.no.payload`. */
export function parseFieldMap(raw: string): { map: Record<string, string>; error?: string } {
  const text = raw.trim();
  if (!text) return { map: {} };
  if (text.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { map: {}, error: "JSON precisa ser um objeto { campo: caminho }" };
      const map: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v !== "string") return { map: {}, error: `Valor de "${k}" precisa ser texto` };
        if (k.trim() && v.trim()) map[k.trim()] = v.trim();
      }
      return { map };
    } catch {
      return { map: {}, error: "JSON inválido" };
    }
  }
  const map: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i <= 0) return { map: {}, error: `Linha inválida: "${l}" (use campo=caminho)` };
    const k = l.slice(0, i).trim();
    const v = l.slice(i + 1).trim();
    if (k && v) map[k] = v;
  }
  return { map };
}

export function fieldMapToLines(map: Record<string, string>): string {
  return Object.entries(map ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}
