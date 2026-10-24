import { createDatabase } from "@cotolk/db";
import { PostgresDialect } from "kysely";
import pg from "pg";

export function databaseUrl() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return connectionString;
}

export async function withDatabase<T>(
  run: (db: ReturnType<typeof createDatabase>) => Promise<T>,
) {
  const db = createDatabase(
    new PostgresDialect({
      pool: new pg.Pool({ connectionString: databaseUrl(), max: 1 }),
    }),
  );
  try {
    return await run(db);
  } finally {
    await db.destroy();
  }
}
