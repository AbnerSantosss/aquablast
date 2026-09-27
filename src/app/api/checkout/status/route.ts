import { checkoutStatus } from "../_lib/status";

/** GET /api/checkout/status?t=<publicToken> — mesma resposta de /api/checkout/status/<publicToken>. */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return checkoutStatus(request, new URL(request.url).searchParams.get("t"));
}
