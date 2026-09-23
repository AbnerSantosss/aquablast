import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

declare global {
  var __aquablastDb: Db | undefined;
}

/**
 * Conexão criada só no primeiro uso (não no import): assim `next build` e a
 * coleta de páginas estáticas não exigem DATABASE_URL nem segredos.
 * Em dev o global evita vazar pools a cada recarga do HMR.
 */
function create(): Db {
  const pool = new Pool({
    connectionString: env().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return drizzle(pool, { schema });
}

function instance(): Db {
  if (!globalThis.__aquablastDb) globalThis.__aquablastDb = create();
  return globalThis.__aquablastDb;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = instance();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
