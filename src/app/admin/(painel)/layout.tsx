import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Shell } from "@/components/admin/Shell";
import { getActiveAdminSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  // Checa no banco (conta existe, ativa, sessão emitida depois da última troca de senha).
  // getActiveAdminSession já roda o ensureBootstrap antes da consulta.
  const session = await getActiveAdminSession();
  if (!session) redirect("/admin/login");
  return <Shell admin={{ name: session.name, email: session.email }}>{children}</Shell>;
}
