import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { isProd } from "@/lib/env";

/**
 * Id anônimo do visitante (cookie httpOnly aqb_vid, 1 ano). Conta "visitantes" no funil do dashboard e vai
 * como external_id (com hash) no PageView/ViewContent. Não é dado pessoal: é um número aleatório.
 */
const VISITOR_COOKIE = "aqb_vid";
const VISITOR_RE = /^[a-f0-9-]{36}$/;

/** Lê o id do cookie; sem cookie (ou inválido), cria e grava. Só em Route Handler / Server Action. */
export async function visitorId(): Promise<string> {
  const jar = await cookies();
  const saved = jar.get(VISITOR_COOKIE)?.value ?? "";
  if (VISITOR_RE.test(saved)) return saved;
  const id = randomUUID();
  jar.set(VISITOR_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: isProd(), path: "/", maxAge: 365 * 86_400 });
  return id;
}
