import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";

/**
 * Trava contra o preenchimento automático do navegador nas telas de integração (Pixels, Gateways).
 * Em 29/09 o Chrome pôs a senha do painel no token da Meta e no segredo do GA4, e o e-mail no ID de medição.
 * Salvar isso quebraria a integração sem aviso (e gravaria a senha do painel como "token").
 * Devolve a mensagem de erro, ou null se nenhum segredo informado for a senha do admin logado.
 */
export async function rejectPanelPassword(adminId: string, secrets: Record<string, string>): Promise<string | null> {
  const filled = Object.entries(secrets).filter(([, v]) => v.trim() !== "");
  if (!filled.length) return null;
  const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, adminId), columns: { passwordHash: true } });
  if (!user) return null;
  for (const [label, value] of filled) {
    if (await compare(value, user.passwordHash)) {
      return `O campo "${label}" está com a senha do painel (preenchimento automático do navegador). Apague e cole o valor certo.`;
    }
  }
  return null;
}

/** E-mail num campo de ID/token é sinal de preenchimento automático do login. */
export const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
