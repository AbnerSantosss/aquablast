import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Shell } from "@/components/admin/Shell";
import { getShipmentCounts } from "@/lib/admin/queries";
import { log, errorMessage } from "@/lib/log";
import { getActiveAdminSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  // Checa no banco (conta existe, ativa, sessão emitida depois da última troca de senha).
  // getActiveAdminSession já roda o ensureBootstrap antes da consulta.
  const session = await getActiveAdminSession();
  if (!session) redirect("/admin/login");
  // Badge de "Envios" no menu: pedidos pagos sem rastreio que passaram do prazo de postagem.
  // Falha na contagem não pode derrubar o painel inteiro: sem badge e segue.
  let slaLate = 0;
  try {
    slaLate = (await getShipmentCounts()).late;
  } catch (err) {
    log.error("layout: contagem de envios atrasados falhou", { error: errorMessage(err) });
  }
  return (
    <Shell admin={{ name: session.name, email: session.email }} slaLate={slaLate}>
      {children}
    </Shell>
  );
}
