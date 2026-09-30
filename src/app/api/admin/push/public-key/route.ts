import { adminGuard } from "@/app/api/admin/_lib/guard";
import { fail, json } from "@/app/api/checkout/_lib/http";
import { getVapidKeys } from "@/lib/push/send";

export const dynamic = "force-dynamic";

/** Chave VAPID pública (applicationServerKey) para o navegador se inscrever no push do painel. */
export async function GET(): Promise<Response> {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  const keys = await getVapidKeys();
  if (!keys) return fail(503, "Chaves do push ainda não geradas. Recarregue a página em instantes.");
  return json({ ok: true, publicKey: keys.publicKey });
}
