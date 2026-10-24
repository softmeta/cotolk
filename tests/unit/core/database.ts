import { createDatabase, type Database, migrateToLatest } from "@cotolk/db";
import { PGlite } from "@electric-sql/pglite";
import type { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach } from "vitest";

const openDatabases: Kysely<Database>[] = [];

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((db) => db.destroy()));
});

export async function openMigratedDatabase() {
  const db = createDatabase(new PGliteDialect(new PGlite()));
  openDatabases.push(db);
  await migrateToLatest(db);
  return db;
}

export const PASSWORD = "correct horse battery staple";
