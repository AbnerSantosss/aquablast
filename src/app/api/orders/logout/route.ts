import type { NextRequest } from "next/server";
import { destroyBuyerSession } from "@/lib/auth/session";
import { NO_STORE_HEADERS, isSameOrigin, jsonError } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/orders/logout — apaga o cookie de sessão do comprador. Não toca no banco. */
export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden", "Origem não permitida.");
  await destroyBuyerSession();
  return Response.json({ ok: true }, { status: 200, headers: NO_STORE_HEADERS });
}
