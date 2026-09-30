import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions, settings, type PushSubscription } from "@/db/schema";
import { encryptText } from "@/lib/crypto";
import { env, isProd } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";
import { getSettings, setSetting } from "@/lib/settings";
import { PUSH_MAX_PAYLOAD, encryptPayload, generateVapidKeys, vapidAuthorization, type VapidKeys } from "./webpush-crypto";

/**
 * Envio de Web Push para os aparelhos inscritos no app do painel (PWA /admin).
 * Nunca lança: quem chama está dentro de `after()` ou de uma rota do painel.
 * Ver wiki/operacao/aquablast-app-vendas-pwa.md.
 */

/** O que o service worker (public/admin-sw.js) recebe. `kind: "sale"` faz a página aberta tocar a caixa registradora. */
export interface PushMessage {
  title: string;
  body: string;
  /** Uma notificação por tag: a nova substitui a anterior com a mesma tag. */
  tag: string;
  /** Caminho do painel aberto ao tocar na notificação (sempre começa com /admin). */
  url: string;
  kind: "sale" | "event" | "test";
  event?: string;
  orderId?: string | null;
}

export interface PushResult {
  total: number;
  sent: number;
  failed: number;
  removed: number;
}

const EMPTY: PushResult = { total: 0, sent: 0, failed: 0, removed: 0 };

/** Endereço aceito para inscrição: https sempre; http só fora de produção (e2e com endpoint falso local). */
export function endpointAllowed(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.username || u.password) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && !isProd();
  } catch {
    return false;
  }
}

/** `sub` do JWT VAPID: o e-mail do painel ou, sem ele, o site. */
export function vapidSubject(): string {
  const email = (env().ADMIN_EMAIL ?? "").trim();
  return email ? `mailto:${email}` : "https://aquablastbrasil.com.br";
}

export async function getVapidKeys(): Promise<VapidKeys | null> {
  const s = await getSettings(["push.vapid.publicKey", "push.vapid.privateKey"] as const);
  const publicKey = String(s["push.vapid.publicKey"] ?? "");
  const privateKey = String(s["push.vapid.privateKey"] ?? "");
  return publicKey && privateKey ? { publicKey, privateKey } : null;
}

/**
 * Gera o par VAPID na primeira subida (bootstrap). A privada fica cifrada (SECRET_KEYS); nenhuma chave vai
 * para o repositório nem para o .env. Se sobrar só metade do par (ex.: APP_ENCRYPTION_KEY trocada), gera
 * de novo e apaga as inscrições, que ficaram presas à chave antiga.
 */
export async function ensureVapidKeys(): Promise<void> {
  try {
    const current = await getSettings(["push.vapid.publicKey", "push.vapid.privateKey"] as const);
    const hasPub = !!current["push.vapid.publicKey"];
    const hasPriv = !!current["push.vapid.privateKey"];
    if (hasPub && hasPriv) return;
    const keys = generateVapidKeys();
    if (!hasPub && !hasPriv) {
      // Insere a privada só se ninguém gerou antes (dois processos subindo juntos).
      const inserted = await db
        .insert(settings)
        .values({ key: "push.vapid.privateKey", value: encryptText(keys.privateKey), encrypted: true, updatedBy: "bootstrap" })
        .onConflictDoNothing()
        .returning({ key: settings.key });
      if (inserted.length) {
        await setSetting("push.vapid.publicKey", keys.publicKey, "bootstrap");
        log.info("push: chaves VAPID geradas");
        return;
      }
      if (await getVapidKeys()) return;
    }
    await setSetting("push.vapid.privateKey", keys.privateKey, "bootstrap");
    await setSetting("push.vapid.publicKey", keys.publicKey, "bootstrap");
    await db.delete(pushSubscriptions);
    log.warn("push: par VAPID incompleto, gerado de novo (aparelhos precisam ativar os avisos outra vez)");
  } catch (err) {
    log.error("push: falha ao garantir as chaves VAPID", { error: errorMessage(err) });
  }
}

/** Monta o JSON do aviso, cortando o corpo se passar do tamanho de um registro. */
export function encodeMessage(msg: PushMessage): Buffer {
  const full = { ...msg, at: new Date().toISOString() };
  let buf = Buffer.from(JSON.stringify(full), "utf8");
  if (buf.length <= PUSH_MAX_PAYLOAD) return buf;
  const extra = buf.length - PUSH_MAX_PAYLOAD + 8;
  buf = Buffer.from(JSON.stringify({ ...full, body: full.body.slice(0, Math.max(0, full.body.length - extra)) + "…" }), "utf8");
  return buf;
}

type SendOutcome = "ok" | "gone" | "fail";

async function sendOne(sub: PushSubscription, payload: Buffer, keys: VapidKeys, subject: string): Promise<SendOutcome> {
  try {
    if (!endpointAllowed(sub.endpoint)) return "gone";
    const body = encryptPayload(payload, sub.p256dh, sub.auth);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(sub.endpoint, keys, subject),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "high",
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (res.status === 404 || res.status === 410) return "gone";
    if (res.ok) return "ok";
    log.warn("push: serviço recusou", { status: res.status, host: new URL(sub.endpoint).host });
    return "fail";
  } catch (err) {
    log.warn("push: falha ao enviar", { error: errorMessage(err) });
    return "fail";
  }
}

/**
 * Manda o aviso para os aparelhos inscritos (todos, ou só os de um admin / um endpoint).
 * 404/410 apagam a inscrição; outras falhas somam fail_count. Nunca lança.
 */
export async function sendPush(msg: PushMessage, filter: { adminUserId?: string; endpoint?: string } = {}): Promise<PushResult> {
  try {
    const keys = await getVapidKeys();
    if (!keys) return EMPTY;
    const conds: SQL[] = [];
    if (filter.adminUserId) conds.push(eq(pushSubscriptions.adminUserId, filter.adminUserId));
    if (filter.endpoint) conds.push(eq(pushSubscriptions.endpoint, filter.endpoint));
    const subs = await db.select().from(pushSubscriptions).where(conds.length ? and(...conds) : undefined);
    if (!subs.length) return EMPTY;

    const payload = encodeMessage(msg);
    const subject = vapidSubject();
    const outcomes = await Promise.all(subs.map((s) => sendOne(s, payload, keys, subject)));
    const result: PushResult = { total: subs.length, sent: 0, failed: 0, removed: 0 };
    await Promise.all(
      subs.map(async (s, i) => {
        const o = outcomes[i];
        try {
          if (o === "ok") {
            result.sent++;
            await db.update(pushSubscriptions).set({ lastOkAt: new Date(), failCount: 0 }).where(eq(pushSubscriptions.id, s.id));
          } else if (o === "gone") {
            result.removed++;
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
          } else {
            result.failed++;
            await db
              .update(pushSubscriptions)
              .set({ failCount: sql`${pushSubscriptions.failCount} + 1` })
              .where(eq(pushSubscriptions.id, s.id));
          }
        } catch (err) {
          log.warn("push: falha ao atualizar inscrição", { error: errorMessage(err) });
        }
      }),
    );
    return result;
  } catch (err) {
    log.error("push: falha geral no envio", { error: errorMessage(err) });
    return EMPTY;
  }
}

/** Quantos aparelhos estão inscritos (atalho para não montar aviso à toa). */
export async function countSubscriptions(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions);
  return row?.n ?? 0;
}
