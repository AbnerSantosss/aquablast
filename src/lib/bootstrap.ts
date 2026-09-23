import { migrate } from "drizzle-orm/node-postgres/migrator";
import { hash } from "bcryptjs";
import path from "node:path";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { ensureDefaultTemplates } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { seedSettingsFromEnv } from "@/lib/settings";

declare global {
  var __aquablastBootstrap: Promise<void> | undefined;
}

/**
 * Executa uma vez por processo: migrações pendentes, templates padrão, settings do .env
 * e o admin inicial (só quando a tabela está vazia). Chamado pelas rotas que tocam o banco,
 * então a primeira subida no Portainer não exige passo manual.
 */
export function ensureBootstrap(): Promise<void> {
  if (!globalThis.__aquablastBootstrap) {
    globalThis.__aquablastBootstrap = run().catch((err) => {
      globalThis.__aquablastBootstrap = undefined;
      throw err;
    });
  }
  return globalThis.__aquablastBootstrap;
}

async function run(): Promise<void> {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await ensureDefaultTemplates();
  await seedSettingsFromEnv();
  const e = env();
  const existing = await db.query.adminUsers.findFirst();
  if (!existing && e.ADMIN_EMAIL && e.ADMIN_PASSWORD) {
    await db.insert(adminUsers).values({
      email: e.ADMIN_EMAIL.toLowerCase(),
      name: "Administrador",
      passwordHash: await hash(e.ADMIN_PASSWORD, 12),
    });
  }
}
