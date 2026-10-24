import { createDatabase, type Database } from "@cotolk/db";
import { type Kysely, PostgresDialect } from "kysely";
import pg from "pg";

let database: Kysely<Database> | undefined;

function pool(connectionString: string) {
  const created = new pg.Pool({ connectionString });
  created.on("error", (error) => {
    console.error("Idle database connection failed", error);
  });
  return created;
}

export function serverDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  database ??= createDatabase(
    new PostgresDialect({ pool: pool(connectionString) }),
  );
  return database;
}
