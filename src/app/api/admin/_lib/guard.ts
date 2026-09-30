import { getActiveAdminSession } from "@/lib/auth/session";
import { fail } from "@/app/api/checkout/_lib/http";

/**
 * Guarda das rotas /api/admin/* (fora do matcher do proxy, que só cobre /admin/*): sessão do painel
 * conferida no banco. Sem sessão devolve 401 em JSON (requireAdmin redirecionaria, o que não serve a um fetch).
 */
export type AdminGuard =
  | { ok: true; session: { sub: string; email: string; name: string } }
  | { ok: false; response: Response };

export async function adminGuard(): Promise<AdminGuard> {
  const session = await getActiveAdminSession();
  if (!session) return { ok: false, response: fail(401, "Faça login no painel.") };
  return { ok: true, session: { sub: session.sub, email: session.email, name: session.name } };
}
