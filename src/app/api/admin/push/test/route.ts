import { z } from "zod";
import { adminGuard } from "@/app/api/admin/_lib/guard";
import { fail, json, originAllowed, readJson } from "@/app/api/checkout/_lib/http";
import { sendPush } from "@/lib/push/send";

export const dynamic = "force-dynamic";

const TestBody = z.object({ endpoint: z.string().url().max(2048).optional() });

/**
 * "Testar aviso": manda um push de teste para este aparelho (endpoint) ou, sem ele, para todos os
 * aparelhos do admin logado. `kind: "test"` faz a página aberta tocar a caixa registradora, como numa venda.
 */
export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request)) return fail(403, "Origem não permitida.");
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  const body = await readJson(request, 4096);
  if (!body.ok) return body.response;
  const parsed = TestBody.safeParse(body.data ?? {});
  if (!parsed.success) return fail(400, "Pedido inválido.");
  const endpoint = parsed.data.endpoint;
  const result = await sendPush(
    {
      title: "💰 Teste: assim chega uma venda",
      body: "Se apareceu, os avisos do AquaBlast estão ligados neste aparelho.",
      tag: "teste",
      url: "/admin/app",
      kind: "test",
      event: "teste",
    },
    endpoint ? { endpoint } : { adminUserId: guard.session.sub },
  );
  if (result.total === 0) return fail(404, "Nenhum aparelho inscrito. Toque em \"Ativar avisos\" primeiro.");
  return json({ ok: result.sent > 0, ...result });
}
