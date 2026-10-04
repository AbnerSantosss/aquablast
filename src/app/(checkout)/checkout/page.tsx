import { redirect } from "next/navigation";
import { Checkout } from "@/components/checkout/Checkout";
import { selectionFromParams } from "@/lib/checkout/own/catalog";
import { loadCheckoutProps } from "@/lib/checkout/own/checkout-props";
import { ensureBootstrap } from "@/lib/bootstrap";
import { zedyUrlFromSelection } from "@/lib/site/constants";
import { deliveryPromiseText } from "@/lib/site/delivery-promise";

export const dynamic = "force-dynamic";

/**
 * /checkout — página do checkout próprio (plano 8.8). As props do `<Checkout />` vêm de
 * `loadCheckoutProps` (mesma montagem usada pelo link de recuperação em /checkout/pedido/[token]).
 * `checkout.mode === "zedy"`: redireciona para a Zedy com a mesma seleção (compatibilidade, plano 8.9) —
 * quem decidir desligar o checkout próprio no painel volta a mandar todo mundo para a Zedy sem quebrar
 * nenhum link (`PurchaseLink` já manda para `/checkout?...` só quando o modo é "proprio").
 */
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await ensureBootstrap();
  const params = await searchParams;
  const selection = selectionFromParams(params);

  const cupom = Array.isArray(params.cupom) ? params.cupom[0] : params.cupom;
  const { mode, props } = await loadCheckoutProps(selection.pack, false, cupom);
  if (mode === "zedy") {
    redirect(zedyUrlFromSelection(selection));
  }

  return <Checkout {...props} selection={selection} deliveryPromise={deliveryPromiseText()} />;
}
