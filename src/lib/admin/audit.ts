import { db } from "@/db";
import { auditLog } from "@/db/schema";

/** Registro de ações sensíveis do painel (configurações, força de status, criação manual...). */
export async function audit(actor: string, action: string, target?: { type: string; id?: string | null }, detail?: unknown): Promise<void> {
  await db.insert(auditLog).values({
    actor,
    action,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    detail: (detail ?? null) as object | null,
  });
}

export const actorOf = (s: { email: string }) => `admin:${s.email}`;
