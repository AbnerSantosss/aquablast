// Leitura dos cookies do GA4 (_ga e _ga_<id>). Módulo sem "use client": o navegador (capture.ts) e o servidor
// (POST /api/checkout/opened, que lê os cookies da própria requisição) usam as mesmas regras.

/** Id do fluxo GA4 do site (G-P63V467VHL) sem o "G-": nome do cookie de sessão é `_ga_<isto>`. */
export const GA4_STREAM_COOKIE_ID = "P63V467VHL";

/** `_ga` = "GA1.1.<a>.<b>" → client_id "<a>.<b>". */
export function parseGaClientId(cookie: string | undefined): string | undefined {
  if (!cookie) return undefined;
  const parts = cookie.split(".");
  if (parts.length < 4) return undefined;
  const a = parts[parts.length - 2];
  const b = parts[parts.length - 1];
  return /^\d+$/.test(a) && /^\d+$/.test(b) ? `${a}.${b}` : undefined;
}

/** `_ga_<id>` = "GS1.1.<session_id>.<n>..." ou "GS2.1.s<session_id>$o..$g..$t.." → session_id. */
export function parseGaSessionId(cookie: string | undefined): string | undefined {
  if (!cookie) return undefined;
  const parts = cookie.split(".");
  if (parts.length < 3) return undefined;
  const third = parts[2];
  const m = parts[0] === "GS2" ? /^s(\d+)/.exec(third) : /^(\d+)$/.exec(third);
  return m ? m[1] : undefined;
}
