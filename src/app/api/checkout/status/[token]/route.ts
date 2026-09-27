import { checkoutStatus } from "../../_lib/status";

/** GET /api/checkout/status/<publicToken> — ver ../../_lib/status.ts (plano 7.3). */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  const { token } = await ctx.params;
  return checkoutStatus(request, token);
}
