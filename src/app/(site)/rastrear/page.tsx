import type { Metadata } from "next";
import "@/styles/site/style.css";
import "@/styles/tracking/tracking-v47.css";
import TrackingPage from "@/components/tracking/TrackingPage";

export const metadata: Metadata = {
  title: "Acompanhar meu pedido | AquaBlast",
  description: "Acompanhe seu pedido AquaBlast, da aprovação da compra até a entrega.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: { icon: [{ url: "/icons/droplets.svg", type: "image/svg+xml" }] },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * /rastrear — página do comprador. Aceita `?codigo=XXXX` para preencher e consultar
 * automaticamente (o cliente remove o parâmetro da URL logo em seguida).
 */
export default async function RastrearPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const raw = params.codigo;
  const initialCode = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 200) ?? "";
  return <TrackingPage initialCode={initialCode} />;
}
