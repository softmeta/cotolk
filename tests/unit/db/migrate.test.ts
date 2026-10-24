import {
  createDatabase,
  type Database,
  DatabaseTooNewError,
  LATEST_MIGRATION,
  migrateToLatest,
} from "@cotolk/db";
import { migrateTo } from "@cotolk/db/internal/migrate";
import { PGlite } from "@electric-sql/pglite";
import { type Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, describe, expect, it } from "vitest";

const openDatabases: Kysely<Database>[] = [];

function openDatabase() {
  const db = createDatabase(new PGliteDialect(new PGlite()));
  openDatabases.push(db);
  return db;
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((db) => db.destroy()));
});

async function appliedMigrations(db: Kysely<Database>) {
  const { rows } = await sql<{ name: string }>`
    SELECT name FROM cotolk_migration ORDER BY name
  `.execute(db);
  return rows.map((row) => row.name);
}

describe("migrateToLatest", () => {
  it("brings an empty database to the latest schema", async () => {
    const db = openDatabase();

    expect(await migrateToLatest(db)).toEqual({ applied: [LATEST_MIGRATION] });

    expect(await appliedMigrations(db)).toEqual([LATEST_MIGRATION]);
    const organization = await db
      .insertInto("organizations")
      .values({ slug: "acme", name: "Acme" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const project = await db
      .insertInto("projects")
      .values({
        organizationId: organization.id,
        slug: "shop",
        name: "Shop",
        sourceLocale: "en-US",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    expect(project).toMatchObject({
      targetLocales: [],
      formatConfig: {},
    });
  });

  it("does nothing on an up-to-date database", async () => {
    const db = openDatabase();
    await migrateToLatest(db);

    expect(await migrateToLatest(db)).toEqual({ applied: [] });
  });

  it("refuses a database written by a newer release and leaves it as is", async () => {
    const db = openDatabase();
    await migrateToLatest(db);
    await sql`
      INSERT INTO cotolk_migration (name, timestamp)
      VALUES ('9999_from_the_future', now()::text)
    `.execute(db);

    await expect(migrateToLatest(db)).rejects.toBeInstanceOf(
      DatabaseTooNewError,
    );
    expect(await appliedMigrations(db)).toEqual([
      LATEST_MIGRATION,
      "9999_from_the_future",
    ]);
  });

  it("stops at a named migration and resumes from there", async () => {
    const db = openDatabase();

    expect(await migrateTo(db, LATEST_MIGRATION)).toEqual({
      applied: [LATEST_MIGRATION],
    });
    expect(await migrateToLatest(db)).toEqual({ applied: [] });
  });

  it("keeps project slugs unique within an organization only", async () => {
    const db = openDatabase();
    await migrateToLatest(db);
    const organization = (slug: string) =>
      db
        .insertInto("organizations")
        .values({ slug, name: slug })
        .returning("id")
        .executeTakeFirstOrThrow();
    const first = await organization("acme");
    const second = await organization("globex");
    const project = (organizationId: string) => ({
      organizationId,
      slug: "shop",
      name: "Shop",
      sourceLocale: "en-US",
    });

    await db
      .insertInto("projects")
      .values([project(first.id), project(second.id)])
      .execute();
    await expect(
      db.insertInto("projects").values(project(first.id)).execute(),
    ).rejects.toThrow(/unique/i);
  });
});
