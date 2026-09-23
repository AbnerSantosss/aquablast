import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Shell } from "@/components/admin/Shell";
import { getAdminSession } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  await ensureBootstrap();
  return <Shell admin={{ name: session.name, email: session.email }}>{children}</Shell>;
}
