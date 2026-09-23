import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://aquablast:aquablast@127.0.0.1:55440/aquablast",
  },
  strict: true,
  verbose: true,
});
