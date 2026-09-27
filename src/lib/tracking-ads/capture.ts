"use client";
// Lado do NAVEGADOR (plano 9.3, revisado 2026-09-27 03h16). Única função: LER identificadores de anúncio
// (cookies _fbp/_fbc/_ga/_ga_<id>, ?fbclid, ?gclid, utm_*) para a UI mandar em cartSchema.tracking junto com `consent`.
// NÃO existe dataLayer, pushCheckoutEvent nem pixel aqui: os eventos do checkout saem só do servidor (trackServerEvent).
// Nunca grava cookie, nunca chama rede. Quem chama decide o consentimento: sem consentimento, a UI não deve mandar o resultado.
import type { AdIds } from "./types";

/** Id do fluxo GA4 do site (G-P63V467VHL) sem o "G-": nome do cookie de sessão é `_ga_<isto>`. */
const GA4_STREAM_COOKIE_ID = "P63V467VHL";

const MAX = { fbp: 200, fbc: 500, ga: 100, gclid: 200, utmKey: 40, utmValue: 200 } as const;

function readCookies(): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = typeof document === "undefined" ? "" : document.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    let value = part.slice(i + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // mantém cru
    }
    if (name && !(name in out)) out[name] = value;
  }
  return out;
}

const clean = (v: string | null | undefined, max: number): string | undefined => {
  const s = (v ?? "").trim();
  return s && s.length <= max ? s : undefined;
};

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

/** `_fbc` válido: "fb.<n>.<timestamp>.<fbclid>". */
const FBC_RE = /^fb\.\d\.\d{10,13}\..+$/;
/** `_fbp` válido: "fb.<n>.<timestamp>.<random>". */
const FBP_RE = /^fb\.\d\.\d{10,13}\.\d+$/;

/**
 * Lê os identificadores sem efeito colateral. Tudo em try/catch: em qualquer falha devolve o que conseguiu (ou {}).
 * - fbp: cookie _fbp.
 * - fbc: cookie _fbc; sem cookie e com ?fbclid= na URL → "fb.1.<Date.now()>.<fbclid>" (formato da Meta).
 * - gaClientId / gaSessionId: cookies _ga e _ga_P63V467VHL.
 * - gclid: ?gclid= da URL.
 * - utm: só chaves utm_* da URL.
 */
export function readAdIds(): AdIds {
  const ids: AdIds = {};
  try {
    const cookies = readCookies();
    let params: URLSearchParams | null = null;
    try {
      params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
    } catch {
      params = null;
    }

    const fbp = clean(cookies._fbp, MAX.fbp);
    if (fbp && FBP_RE.test(fbp)) ids.fbp = fbp;

    const fbcCookie = clean(cookies._fbc, MAX.fbc);
    if (fbcCookie && FBC_RE.test(fbcCookie)) ids.fbc = fbcCookie;
    else {
      const fbclid = clean(params?.get("fbclid"), MAX.fbc - 20);
      if (fbclid) ids.fbc = `fb.1.${Date.now()}.${fbclid}`;
    }

    const gaClientId = clean(parseGaClientId(cookies._ga), MAX.ga);
    if (gaClientId) ids.gaClientId = gaClientId;
    const gaSessionId = clean(parseGaSessionId(cookies[`_ga_${GA4_STREAM_COOKIE_ID}`]), MAX.ga);
    if (gaSessionId) ids.gaSessionId = gaSessionId;

    const gclid = clean(params?.get("gclid"), MAX.gclid);
    if (gclid) ids.gclid = gclid;

    if (params) {
      const utm: Record<string, string> = {};
      params.forEach((value, key) => {
        const k = key.trim().toLowerCase();
        const v = clean(value, MAX.utmValue);
        if (/^utm_[a-z_]{1,30}$/.test(k) && k.length <= MAX.utmKey && v && !(k in utm)) utm[k] = v;
      });
      if (Object.keys(utm).length) ids.utm = utm;
    }
  } catch {
    // Leitura é "melhor esforço": nunca quebra o checkout.
  }
  return ids;
}
