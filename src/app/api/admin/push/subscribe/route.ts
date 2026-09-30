import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { adminGuard } from "@/app/api/admin/_lib/guard";
import { fail, json, originAllowed, readJson } from "@/app/api/checkout/_lib/http";
import { endpointAllowed } from "@/lib/push/send";

export const dynamic = "force-dynamic";

const b64url = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/);
const SubscribeBody = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: b64url.min(80).max(100), auth: b64url.min(16).max(64) }),
});
const UnsubscribeBody = z.object({ endpoint: z.string().url().max(2048) });

/**
 * Inscreve (ou atualiza) este aparelho no push do painel. Idempotente por endpoint: a página chama de novo
 * a cada abertura para manter a inscrição do navegador e a do banco iguais.
 */
export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  const body = await readJson(request, 4096);
  if (!body.ok) return body.response;
  const parsed = SubscribeBody.safeParse(body.data);
  if (!parsed.success) return fail(400, "Inscrição inválida.");
  const { endpoint, keys } = parsed.data;
  if (!endpointAllowed(endpoint)) return fail(400, "Endereço de push não aceito.");
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300) || null;
  const values = {
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent,
    adminUserId: guard.session.sub,
    email: guard.session.email,
    failCount: 0,
  };
  await db
    .insert(pushSubscriptions)
    .values({ endpoint, ...values })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
  return json({ ok: true });
}

/** Tira este aparelho dos avisos. */
export async function DELETE(request: Request): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  const body = await readJson(request, 4096);
  if (!body.ok) return body.response;
  const parsed = UnsubscribeBody.safeParse(body.data);
  if (!parsed.success) return fail(400, "Inscrição inválida.");
  const removed = await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, parsed.data.endpoint)).returning({ id: pushSubscriptions.id });
  return json({ ok: true, removed: removed.length });
}
