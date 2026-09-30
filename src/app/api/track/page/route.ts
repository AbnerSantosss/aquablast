import { cookies } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { ensureBootstrap } from "@/lib/bootstrap";
import { env, isProd } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordPageVisit, sendPageEvents, type PageVisitInput } from "@/lib/tracking-ads/page-events";
import { visitorId } from "@/lib/tracking-ads/visitor";
import { json, originAllowed, readJson } from "../../checkout/_lib/http";

/**
 * POST /api/track/page — uma visita ao site público (PageTracker, layout do site).
 * Grava site_visits (funil do dashboard) e manda PageView/ViewContent pela API de Conversões com o mesmo
 * event_id do Pixel do navegador (page-events.ts). Sempre responde `{ ok:true }`: é rastreio, não pode
 * dar erro para o visitante. Robôs (Googlebot, prévia de link, Lighthouse) não contam como visita.
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024;
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|meta-externalagent|lighthouse|headless|preview|monitor|curl|wget|python|axios|node-fetch|go-http/i;

const pageSchema = z.object({
  pv: z.string().regex(/^pv-[a-z0-9]{8,40}$/),
  vc: z.string().regex(/^vc-[a-z0-9]{8,40}$/).optional(),
  url: z.string().max(2000),
});

const FBP_RE = /^fb\.\d\.\d{10,13}\.\d+$/;
const FBC_RE = /^fb\.\d\.\d{10,13}\..+$/;

/** A URL tem que ser do próprio site (fora de produção, o host da requisição também vale). */
function siteUrl(raw: string, request: Request): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  try {
    if (u.origin === new URL(env().APP_URL).origin) return u;
  } catch {
    return null;
  }
  const host = request.headers.get("host");
  return !isProd() && host && u.host.toLowerCase() === host.toLowerCase() ? u : null;
}

export async function POST(request: Request): Promise<Response> {
  const done = json({ ok: true });
  if (!originAllowed(request)) return done;
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? "";
  if (!userAgent || BOT_RE.test(userAgent)) return done;

  try {
    await ensureBootstrap();
    const ip = clientIp(request.headers);
    const limit = await rateLimit(`site:pv:${ip}`, 60, 60);
    if (!limit.allowed) return done;

    const body = await readJson(request, MAX_BODY_BYTES);
    if (!body.ok) return done;
    const parsed = pageSchema.safeParse(body.data);
    if (!parsed.success) return done;
    const url = siteUrl(parsed.data.url, request);
    if (!url) return done;

    const vid = await visitorId();
    const jar = await cookies();
    const fbp = jar.get("_fbp")?.value;
    const cookieFbc = jar.get("_fbc")?.value;
    const fbclid = url.searchParams.get("fbclid")?.slice(0, 400);
    const fbc = cookieFbc && FBC_RE.test(cookieFbc) ? cookieFbc : fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined;

    const visit: PageVisitInput = {
      pvId: parsed.data.pv,
      vcId: parsed.data.vc,
      url,
      visitorId: vid,
      clientIp: ip === "unknown" ? undefined : ip,
      userAgent,
      fbp: fbp && FBP_RE.test(fbp) ? fbp : undefined,
      fbc,
    };
    if (await recordPageVisit(visit)) after(() => sendPageEvents(visit));
  } catch (err) {
    log.warn("track/page: falha ao registrar visita", { detail: errorMessage(err) });
  }
  return done;
}
