import { adminGuard } from "@/app/api/admin/_lib/guard";
import { fail, json } from "@/app/api/checkout/_lib/http";
import { recentSales } from "@/lib/push/sales";

export const dynamic = "force-dynamic";

/**
 * Últimas 20 vendas pagas (app do painel). `?since=<ISO>` devolve só as pagas depois disso: é o polling
 * de 20 s que toca a caixa registradora com o app aberto, mesmo sem push.
 */
export async function GET(request: Request): Promise<Response> {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  const raw = new URL(request.url).searchParams.get("since");
  let since: Date | null = null;
  if (raw) {
    since = new Date(raw);
    if (Number.isNaN(since.getTime())) return fail(400, "Parâmetro since inválido (use ISO 8601).");
  }
  const sales = await recentSales(since);
  return json({ ok: true, now: new Date().toISOString(), sales });
}
