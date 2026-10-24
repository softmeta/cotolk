import { createDatabase, type Database, migrateToLatest } from "@cotolk/db";
import { PGlite } from "@electric-sql/pglite";
import type { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterAll, afterEach } from "vitest";

const openDatabases: Kysely<Database>[] = [];
let migratedTemplate: Promise<PGlite> | undefined;

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((db) => db.destroy()));
});

afterAll(async () => {
  await (await migratedTemplate)?.close();
});

async function createMigratedTemplate() {
  const template = new PGlite();
  const db = createDatabase(new PGliteDialect(template));
  await migrateToLatest(db);
  return template;
}

export async function openMigratedDatabase() {
  migratedTemplate ??= createMigratedTemplate();
  const instance = (await (await migratedTemplate).clone()) as PGlite;
  const db = createDatabase(new PGliteDialect(instance));
  openDatabases.push(db);
  return db;
}

export const PASSWORD = "correct horse battery staple";
