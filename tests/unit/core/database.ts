import { createDatabase, type Database, migrateToLatest } from "@cotolk/db";
import { PGlite } from "@electric-sql/pglite";
import type { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterAll, afterEach, beforeAll } from "vitest";

const openDatabases: Kysely<Database>[] = [];
let migratedTemplate: PGlite;

beforeAll(async () => {
  migratedTemplate = await PGlite.create();
  await migrateToLatest(createDatabase(new PGliteDialect(migratedTemplate)));
});

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((db) => db.destroy()));
});

afterAll(async () => {
  await migratedTemplate.close();
});

export async function openMigratedDatabase() {
  const instance = (await migratedTemplate.clone()) as PGlite;
  const db = createDatabase(new PGliteDialect(instance));
  openDatabases.push(db);
  return db;
}

export const PASSWORD = "correct horse battery staple";
