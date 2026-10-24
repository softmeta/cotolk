import {
  createDatabase,
  type Database,
  DatabaseTooNewError,
  migrateToLatest,
} from "@cotolk/db";
import { migrateTo } from "@cotolk/db/internal/migrate";
import { PGlite } from "@electric-sql/pglite";
import { type Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const ALL_MIGRATIONS = [
  "0001_organizations_and_projects",
  "0002_accounts_and_tokens",
];

const openDatabases: Kysely<Database>[] = [];
let emptyTemplate: Promise<PGlite> | undefined;

async function openDatabase() {
  emptyTemplate ??= PGlite.create();
  const instance = (await (await emptyTemplate).clone()) as PGlite;
  const db = createDatabase(new PGliteDialect(instance));
  openDatabases.push(db);
  return db;
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((db) => db.destroy()));
});

afterAll(async () => {
  await (await emptyTemplate)?.close();
});

async function appliedMigrations(db: Kysely<Database>) {
  const { rows } = await sql<{ name: string }>`
    SELECT name FROM cotolk_migration ORDER BY name
  `.execute(db);
  return rows.map((row) => row.name);
}

describe("migrateToLatest", () => {
  it("brings an empty database to the latest schema", async () => {
    const db = await openDatabase();

    expect(await migrateToLatest(db)).toEqual({ applied: ALL_MIGRATIONS });

    expect(await appliedMigrations(db)).toEqual(ALL_MIGRATIONS);
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
    const db = await openDatabase();
    await migrateToLatest(db);

    expect(await migrateToLatest(db)).toEqual({ applied: [] });
  });

  it("refuses a database written by a newer release and leaves it as is", async () => {
    const db = await openDatabase();
    await migrateToLatest(db);
    await sql`
      INSERT INTO cotolk_migration (name, timestamp)
      VALUES ('9999_from_the_future', now()::text)
    `.execute(db);

    await expect(migrateToLatest(db)).rejects.toBeInstanceOf(
      DatabaseTooNewError,
    );
    expect(await appliedMigrations(db)).toEqual([
      ...ALL_MIGRATIONS,
      "9999_from_the_future",
    ]);
  });

  it("stops at a named migration and resumes from there", async () => {
    const db = await openDatabase();

    expect(await migrateTo(db, "0001_organizations_and_projects")).toEqual({
      applied: ["0001_organizations_and_projects"],
    });
    expect(await migrateToLatest(db)).toEqual({
      applied: ALL_MIGRATIONS.slice(1),
    });
  });

  it("keeps project slugs unique within an organization only", async () => {
    const db = await openDatabase();
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

  it("keeps organizations and projects when accounts and tokens arrive", async () => {
    const db = await openDatabase();
    await migrateTo(db, "0001_organizations_and_projects");
    const organization = await db
      .insertInto("organizations")
      .values({ slug: "acme", name: "Acme" })
      .returningAll()
      .executeTakeFirstOrThrow();
    const project = await db
      .insertInto("projects")
      .values({
        organizationId: organization.id,
        slug: "shop",
        name: "Shop",
        sourceLocale: "en-US",
        targetLocales: ["zh-CN"],
        formatConfig: JSON.stringify({ format: "i18next-json" }),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await migrateToLatest(db);

    expect(await db.selectFrom("organizations").selectAll().execute()).toEqual([
      organization,
    ]);
    expect(await db.selectFrom("projects").selectAll().execute()).toEqual([
      project,
    ]);
    const user = await db
      .insertInto("users")
      .values({ email: "ada@example.invalid", name: "Ada" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("memberships")
      .values({
        organizationId: organization.id,
        userId: user.id,
        role: "owner",
      })
      .execute();
    const guest = await db
      .insertInto("users")
      .values({ email: "grace@example.invalid", name: "Grace" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await expect(
      sql`INSERT INTO memberships (organization_id, user_id, role)
          VALUES (${organization.id}, ${guest.id}, 'admin')`.execute(db),
    ).rejects.toThrow(/check constraint/i);
  });
});
