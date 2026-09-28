import { ensureBootstrap } from "@/lib/bootstrap";
import { quoteBoth } from "@/lib/checkout/own/pricing";
import { getTheme } from "@/lib/checkout/own/theme-server";
import { gatewayFor } from "@/lib/gateways";
import { errorMessage, log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { fail, json, tooMany } from "../_lib/http";

/**
 * GET /api/checkout/config — configuração PÚBLICA do checkout para a tela. Nenhum segredo:
 * - métodos disponíveis e o gateway de cada um;
 * - `tokenizesCard` + `publicConfig` do gateway de cartão (ex.: publicKey do Mercado Pago), para a
 *   tela tokenizar o cartão no navegador quando o gateway exigir;
 * - preços calculados no servidor (quote Pix e cartão de unidade e kit, sem bump), parcelas máximas,
 *   validade do Pix e se a oferta de 2ª unidade está ligada; tema da tela.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  await ensureBootstrap();
  const limit = await rateLimit(`ck:config:${clientIp(request.headers)}`, 120, 60);
  if (!limit.allowed) return tooMany(limit.retryAfterSeconds);

  try {
    const s = await getSettings(["checkout.mode", "checkout.maxInstallments", "checkout.pixTtlSeconds", "checkout.bumpEnabled", "gateway.card", "checkout.cardComingSoon"] as const);
    const [pixGw, cardGw] = await Promise.all([gatewayFor("pix"), gatewayFor("card")]);
    const maxInstallments = Math.max(1, Math.min(12, Math.trunc(s["checkout.maxInstallments"])));
    const publicConfig = cardGw ? await cardGw.publicConfig() : {};
    const [unit, kit, theme] = await Promise.all([quoteBoth("unit", false, maxInstallments), quoteBoth("kit", false, maxInstallments), getTheme()]);

    const methods: ("pix" | "card")[] = [];
    if (pixGw) methods.push("pix");
    const cardPending = !cardGw && !!pixGw && s["checkout.cardComingSoon"];
    if (cardGw || cardPending) methods.push("card");

    return json({
      ok: true,
      mode: s["checkout.mode"],
      methods,
      pix: { available: !!pixGw, gateway: pixGw?.name ?? null },
      card: {
        enabled: s["gateway.card"] !== "desligado",
        available: !!cardGw,
        /** Aparece no checkout com as parcelas, mas ainda sem gateway (paga só no Pix). */
        comingSoon: cardPending,
        gateway: cardGw?.name ?? null,
        tokenizesCard: cardGw?.tokenizesCard ?? false,
        publicConfig,
      },
      tokenizesCard: cardGw?.tokenizesCard ?? false,
      publicConfig,
      prices: { unit, kit },
      maxInstallments,
      pixTtlSeconds: s["checkout.pixTtlSeconds"],
      bumpEnabled: s["checkout.bumpEnabled"],
      theme,
    });
  } catch (err) {
    log.error("checkout config: falha ao montar", { error: errorMessage(err) });
    return fail(500, "Configuração do checkout indisponível.");
  }
}
