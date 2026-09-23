import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * GET /api/health — usado pelo HEALTHCHECK do Docker e por monitores externos.
 * Sem autenticação e sem bootstrap (não roda migrações): só confirma que o processo
 * responde e se o Postgres atende um SELECT 1 em até 3 s.
 * Responde 200 mesmo com `db: false`: reiniciar o container não resolve banco fora do ar.
 */
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3_000;

export async function GET(): Promise<Response> {
  let dbOk = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS);
      }),
    ]);
    dbOk = true;
  } catch {
    dbOk = false;
  } finally {
    if (timer) clearTimeout(timer);
  }
  return Response.json({ ok: true, db: dbOk, time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
