import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, type Db } from "@/db";
import { adminPasswordResets, adminUsers } from "@/db/schema";
import { PASSWORD_RESET_TTL_MINUTES } from "@/lib/admin/schemas/auth";
import { ensureBootstrap } from "@/lib/bootstrap";
import { sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";

/*
 * Links de "Esqueci minha senha" do painel.
 * NÃO é arquivo "use server": todo export de um arquivo "use server" vira endpoint público.
 *
 * - Token: 32 bytes aleatórios em base64url (43 caracteres). No banco só o SHA-256 (hex).
 * - O token em claro só existe no link do e-mail: nunca vai para email_log, audit_log ou log.
 * - Datas (created_at, expires_at, used_at, password_changed_at) usam o relógio da aplicação, o mesmo
 *   que assina o iat do JWT; assim a comparação iat >= password_changed_at não depende do relógio do banco.
 */

export { PASSWORD_RESET_TTL_MINUTES };
export const PASSWORD_RESET_TTL_MS = PASSWORD_RESET_TTL_MINUTES * 60 * 1000;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Formato do token (base64url de 32 bytes). Filtra lixo antes de ir ao banco. */
export function isPasswordResetTokenFormat(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

export function hashPasswordResetToken(token: string): string {
  return sha256Hex(token);
}

/** Link do e-mail. Sempre montado com APP_URL, nunca com o Host da requisição (evita envenenar o link). */
export function passwordResetUrl(token: string): string {
  return `${env().APP_URL.replace(/\/$/, "")}/admin/login/redefinir-senha?token=${encodeURIComponent(token)}`;
}

/** Marca como usados todos os links ainda abertos do admin (novo pedido, redefinição concluída, troca de senha). */
export async function invalidateOpenPasswordResets(tx: Tx, adminUserId: string, at: Date = new Date()): Promise<void> {
  await tx
    .update(adminPasswordResets)
    .set({ usedAt: at })
    .where(and(eq(adminPasswordResets.adminUserId, adminUserId), isNull(adminPasswordResets.usedAt)));
}

/**
 * Cria um link novo para o admin, invalidando os anteriores, e devolve o token em claro
 * (que só pode seguir para o e-mail).
 */
export async function issuePasswordResetToken(adminUserId: string, requestedIp: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.transaction(async (tx) => {
    await invalidateOpenPasswordResets(tx, adminUserId, now);
    await tx.insert(adminPasswordResets).values({
      adminUserId,
      tokenHash: hashPasswordResetToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      requestedIp: requestedIp && requestedIp !== "unknown" ? requestedIp.slice(0, 100) : null,
    });
  });
  return token;
}

/**
 * Consulta do GET da página /admin/login/redefinir-senha. NÃO consome o link (leitores de e-mail
 * abrem links sozinhos). Devolve o e-mail da conta quando o link existe, não foi usado, não expirou
 * e o admin está ativo; senão null. Formato inválido volta null sem ir ao banco.
 */
export async function getPasswordResetTarget(token: unknown): Promise<{ email: string } | null> {
  if (!isPasswordResetTokenFormat(token)) return null;
  await ensureBootstrap();
  const [row] = await db
    .select({ email: adminUsers.email })
    .from(adminPasswordResets)
    .innerJoin(adminUsers, eq(adminUsers.id, adminPasswordResets.adminUserId))
    .where(
      and(
        eq(adminPasswordResets.tokenHash, hashPasswordResetToken(token)),
        isNull(adminPasswordResets.usedAt),
        gt(adminPasswordResets.expiresAt, new Date()),
        isNull(adminUsers.disabledAt),
      ),
    )
    .limit(1);
  return row ? { email: row.email } : null;
}

/**
 * Consome o link e grava a nova senha numa transação. O consumo é atômico:
 * UPDATE admin_password_resets SET used_at = agora FROM admin_users
 * WHERE token_hash = $1 AND used_at IS NULL AND expires_at > agora AND admin ativo RETURNING.
 * Duas requisições simultâneas com o mesmo link: só uma recebe a linha.
 * Depois: password_hash, password_changed_at = agora (derruba as sessões abertas) e invalida os
 * outros links abertos do admin. Link inválido/expirado/usado ou admin desativado: null e nada muda.
 */
export async function consumePasswordResetToken(token: string, passwordHash: string): Promise<{ id: string; email: string } | null> {
  if (!isPasswordResetTokenFormat(token)) return null;
  const tokenHash = hashPasswordResetToken(token);
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(adminPasswordResets)
      .set({ usedAt: now })
      .from(adminUsers)
      .where(
        and(
          eq(adminPasswordResets.tokenHash, tokenHash),
          isNull(adminPasswordResets.usedAt),
          gt(adminPasswordResets.expiresAt, now),
          eq(adminUsers.id, adminPasswordResets.adminUserId),
          isNull(adminUsers.disabledAt),
        ),
      )
      .returning({ id: adminUsers.id, email: adminUsers.email });
    if (!row) return null;
    await tx.update(adminUsers).set({ passwordHash, passwordChangedAt: now }).where(eq(adminUsers.id, row.id));
    await invalidateOpenPasswordResets(tx, row.id, now);
    return row;
  });
}
