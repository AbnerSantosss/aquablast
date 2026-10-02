import { z } from "zod";
import { db } from "@/db";
import { buyClicks } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { errorMessage, log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { visitorId } from "@/lib/tracking-ads/visitor";
import { json, originAllowed, readJson } from "../../checkout/_lib/http";

/**
 * POST /api/track/click — um clique no botão Comprar da LP (PurchaseLink), pedido do dono em 2026-10-02.
 * Grava buy_clicks para o painel /admin/cliques. Sempre responde `{ ok:true }`: é rastreio, não pode atrapalhar
 * a ida ao checkout. Robôs não contam (mesma lista do track/page).
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|meta-externalagent|lighthouse|headless|preview|monitor|curl|wget|python|axios|node-fetch|go-http/i;
const COLOR = z.enum(["azul", "vermelho", "preto"]);

const clickSchema = z.object({
  id: z.string().regex(/^bc-[a-z0-9]{8,40}$/),
  pack: z.enum(["unit", "kit"]),
  colors: z.array(COLOR).min(1).max(2),
  complete: z.boolean(),
  warned: z.boolean(),
  place: z.enum(["topo", "ofertas"]),
  device: z.enum(["mobile", "desktop"]),
  utm: z.string().max(80).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const done = json({ ok: true });
  if (!originAllowed(request)) return done;
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!userAgent || BOT_RE.test(userAgent)) return done;

  try {
    await ensureBootstrap();
    const limit = await rateLimit(`site:click:${clientIp(request.headers)}`, 30, 60);
    if (!limit.allowed) return done;

    const body = await readJson(request, MAX_BODY_BYTES);
    if (!body.ok) return done;
    const parsed = clickSchema.safeParse(body.data);
    if (!parsed.success) return done;
    const c = parsed.data;

    await db
      .insert(buyClicks)
      .values({
        eventId: c.id,
        visitorId: await visitorId(),
        pack: c.pack,
        colors: c.colors.join("+"),
        complete: c.complete,
        warnedOnly: c.warned,
        place: c.place,
        device: c.device,
        utmSource: c.utm?.trim() || null,
      })
      .onConflictDoNothing({ target: buyClicks.eventId });
  } catch (err) {
    log.warn("track/click: falha ao registrar clique", { detail: errorMessage(err) });
  }
  return done;
}
