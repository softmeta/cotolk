import path from "node:path";
import { createDatabase, migrateToLatest } from "@cotolk/db";
import { PostgresDialect } from "kysely";
import pg from "pg";
import { serve } from "srvx";
import { staticMiddleware } from "srvx/static";

const distDir = path.join(import.meta.dirname, "..", "dist");

async function migrate(connectionString: string) {
  const db = createDatabase(
    new PostgresDialect({ pool: new pg.Pool({ connectionString, max: 1 }) }),
  );
  try {
    await migrateToLatest(db);
  } finally {
    await db.destroy();
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
await migrate(connectionString);

const { default: app } = await import(
  path.join(distDir, "server", "server.js")
);

const server = serve({
  port: Number(process.env.PORT ?? 3000),
  hostname: process.env.HOST ?? "0.0.0.0",
  middleware: [
    staticMiddleware({
      dir: path.join(distDir, "client"),
      maxAge: 31_536_000,
      immutable: true,
    }),
  ],
  fetch: app.fetch,
});

await server.ready();
