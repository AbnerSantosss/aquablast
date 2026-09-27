import { redirect } from "next/navigation";
import { Checkout } from "@/components/checkout/Checkout";
import { selectionFromParams } from "@/lib/checkout/own/catalog";
import { quoteBoth } from "@/lib/checkout/own/pricing";
import { getTheme } from "@/lib/checkout/own/theme-server";
import { ensureBootstrap } from "@/lib/bootstrap";
import { gatewayFor } from "@/lib/gateways";
import { getSettings } from "@/lib/settings";
import { zedyUrlFromSelection } from "@/lib/site/constants";

export const dynamic = "force-dynamic";

/**
 * /checkout — página do checkout próprio (plano 8.8). Espelha `GET /api/checkout/config`
 * (src/app/api/checkout/config/route.ts) para montar as mesmas props no servidor, mas evita o
 * round-trip HTTP: como já está num Server Component, chama direto `quoteBoth`/`getTheme`/`getSettings`.
 * `checkout.mode === "zedy"`: redireciona para a Zedy com a mesma seleção (compatibilidade, plano 8.9) —
 * quem decidir desligar o checkout próprio no painel volta a mandar todo mundo para a Zedy sem quebrar
 * nenhum link (`PurchaseLink` já manda para `/checkout?...` só quando o modo é "proprio").
 */
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await ensureBootstrap();
  const params = await searchParams;
  const selection = selectionFromParams(params);

  const s = await getSettings(["checkout.mode", "checkout.maxInstallments", "checkout.bumpEnabled"] as const);
  if (s["checkout.mode"] === "zedy") {
    redirect(zedyUrlFromSelection(selection));
  }

  const maxInstallments = Math.max(1, Math.min(12, Math.trunc(s["checkout.maxInstallments"])));
  const [pixGw, cardGw] = await Promise.all([gatewayFor("pix"), gatewayFor("card")]);
  const [quotesInitial, theme] = await Promise.all([quoteBoth(selection.pack, false, maxInstallments), getTheme()]);
  const publicConfig = cardGw ? await cardGw.publicConfig() : {};

  const methods: ("pix" | "card")[] = [];
  if (pixGw) methods.push("pix");
  if (cardGw) methods.push("card");

  return (
    <Checkout
      theme={theme}
      selection={selection}
      methods={methods}
      maxInstallments={maxInstallments}
      bumpEnabled={s["checkout.bumpEnabled"]}
      pixGateway={pixGw?.name ?? null}
      cardGateway={cardGw?.name ?? null}
      cardPublicConfig={publicConfig}
      quotesInitial={quotesInitial}
    />
  );
}
