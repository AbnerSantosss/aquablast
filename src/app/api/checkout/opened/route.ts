import { cookies } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { ensureBootstrap } from "@/lib/bootstrap";
import { quote } from "@/lib/checkout/own/pricing";
import { selectionSchema } from "@/lib/checkout/own/schemas";
import { notifyCheckoutEvent } from "@/lib/email/checkout-alerts";
import { env, isProd } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { trackServerEvent } from "@/lib/tracking-ads/dispatch";
import { GA4_STREAM_COOKIE_ID, parseGaClientId, parseGaSessionId } from "@/lib/tracking-ads/ga-cookies";
import { recordCheckoutOpen } from "@/lib/tracking-ads/page-events";
import type { TrackVisit } from "@/lib/tracking-ads/types";
import { visitorId } from "@/lib/tracking-ads/visitor";
import { fail, json, originAllowed, readJson, tooMany } from "../_lib/http";

/**
 * POST /api/checkout/opened — "alguém abriu o checkout" (pedido do dono, 2026-09-30: "não chegou aviso por
 * email quando o cliente inicia o checkout"). Antes o aviso `inicio` só saía quando o carrinho nascia, e o
 * carrinho só nasce quando o cliente digita o e-mail: quem abria e desistia antes não gerava aviso nenhum.
 *
 * O navegador manda um id de visita (sessionStorage), a seleção e a origem (utm). Nada de dado pessoal.
 * Não repete: 1 aviso por visita a cada 6 h e no máximo 6 por IP por hora (o e-mail da equipe não vira spam
 * se alguém ficar recarregando). Sempre responde `{ ok:true }`: o aviso é detalhe interno, não erro do cliente.
 *
 * InitiateCheckout (Meta CAPI) e begin_checkout (GA4) saem daqui desde 2026-09-30 (campanhas de Vendas no ar sem
 * nenhum InitiateCheckout: o evento só saía quando o carrinho nascia, depois de o cliente digitar os dados).
 * event_id `ic-<visit>`: o carrinho, quando nasce, manda o mesmo id e a reserva em conversion_events descarta o
 * segundo. Sem consentimento (com `ads.consentRequired` ligado) não grava nada aqui: se o cliente aceitar o
 * banner depois, o carrinho ainda manda o evento com o mesmo id. Sem nome, e-mail nem telefone: só a seleção, o
 * preço no Pix, IP, navegador e os cookies de anúncio que a própria requisição traz.
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024;

const openedSchema = z.object({
  visit: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  selection: selectionSchema,
  coupon: z.string().max(40).optional(),
  source: z.string().max(80).optional(),
  campaign: z.string().max(120).optional(),
  /** Resposta do banner já salva no navegador. Sem ela, vale `ads.consentRequired` do painel. */
  consent: z.boolean().optional(),
});

const FBP_RE = /^fb\.\d\.\d{10,13}\.\d+$/;
const FBC_RE = /^fb\.\d\.\d{10,13}\..+$/;

/** URL da página do checkout (Referer do fetch), só se for do próprio site. Dela sai o event_source_url e o fbclid. */
function pageUrl(request: Request): URL | null {
  const raw = request.headers.get("referer");
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.origin === new URL(env().APP_URL).origin) return u;
    const host = request.headers.get("host");
    return !isProd() && host && u.host.toLowerCase() === host.toLowerCase() ? u : null;
  } catch {
    return null;
  }
}

/** Cookies de anúncio da própria requisição (mesmas regras de readAdIds no navegador e de /api/track/page). */
async function adIds(page: URL | null): Promise<Pick<TrackVisit, "fbp" | "fbc" | "gaClientId" | "gaSessionId">> {
  const jar = await cookies();
  const fbp = jar.get("_fbp")?.value;
  const cookieFbc = jar.get("_fbc")?.value;
  const fbclid = page?.searchParams.get("fbclid")?.slice(0, 400);
  return {
    fbp: fbp && fbp.length <= 200 && FBP_RE.test(fbp) ? fbp : undefined,
    fbc: cookieFbc && cookieFbc.length <= 500 && FBC_RE.test(cookieFbc) ? cookieFbc : fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined,
    gaClientId: parseGaClientId(jar.get("_ga")?.value),
    gaSessionId: parseGaSessionId(jar.get(`_ga_${GA4_STREAM_COOKIE_ID}`)?.value),
  };
}

export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  await ensureBootstrap();

  const ip = clientIp(request.headers);
  const limit = await rateLimit(`ck:open:${ip}`, 30, 60);
  if (!limit.allowed) return tooMany(limit.retryAfterSeconds);

  const body = await readJson(request, MAX_BODY_BYTES);
  if (!body.ok) return body.response;
  const parsed = openedSchema.safeParse(body.data);
  if (!parsed.success) return fail(400, "Requisição inválida.");
  const input = parsed.data;

  const vid = await visitorId();
  // Funil do dashboard ("abriram o checkout"): antes do limite de avisos, que é só para o e-mail/push.
  try {
    await recordCheckoutOpen(input.visit, vid, input.source);
  } catch (err) {
    log.warn("checkout aberto: visita não gravada", { error: errorMessage(err) });
  }

  // Rastreio: 1 por visita pela reserva do event_id (recarregar a página não reenvia), fora do limite de avisos.
  let track: Omit<TrackVisit, "valueCents"> | null = null;
  try {
    const consent = input.consent === true || !(await getSetting("ads.consentRequired"));
    if (consent) {
      const page = pageUrl(request);
      track = {
        consent,
        selection: input.selection,
        visitorId: vid,
        sourceUrl: page ? `${page.origin}${page.pathname}` : undefined,
        clientIp: ip === "unknown" ? undefined : ip,
        userAgent: request.headers.get("user-agent")?.slice(0, 500) || undefined,
        ...(await adIds(page)),
      };
    }
  } catch (err) {
    log.warn("checkout aberto: rastreio não preparado", { error: errorMessage(err) });
  }

  const perVisit = await rateLimit(`ck:open:v:${input.visit}`, 1, 6 * 3600);
  const perIp = perVisit.allowed ? await rateLimit(`ck:open:alert:${ip}`, 6, 3600) : perVisit;
  const alert = perVisit.allowed && perIp.allowed;
  if (!alert && !track) return json({ ok: true });

  after(async () => {
    let amountCents: number | null = null;
    try {
      amountCents = (await quote(input.selection.pack, "pix", false, 1, input.coupon)).amountCents;
    } catch (err) {
      log.warn("checkout aberto: preço não calculado", { error: errorMessage(err) });
    }
    // Sem preço não manda: o carrinho, quando nascer, manda o InitiateCheckout com o mesmo id.
    if (track && amountCents !== null) await trackServerEvent({ name: "InitiateCheckout", eventId: `ic-${input.visit}`, visit: { ...track, valueCents: amountCents } });
    if (!alert) return;
    const origin = [input.source, input.campaign].map((v) => v?.replace(/[\u0000-\u001f\u007f<>]/g, "").trim()).filter(Boolean).join(" · ");
    await notifyCheckoutEvent({ event: "inicio", visit: { selection: input.selection, amountCents, origin } });
  });
  return json({ ok: true });
}
