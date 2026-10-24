import { type Kysely, sql } from "kysely";
import { type MigrationResultSet, Migrator } from "kysely/migration";
import { MIGRATIONS } from "./migrations";
import type { Database } from "./schema";

const MIGRATION_TABLE = "cotolk_migration";

export const LATEST_MIGRATION = Object.keys(MIGRATIONS).sort().at(-1) ?? "";

export class DatabaseTooNewError extends Error {
  constructor(readonly unknownMigrations: string[]) {
    super(
      `The database was migrated by a newer Cotolk release (${unknownMigrations.join(", ")}); run that release or a later one.`,
    );
  }
}

async function recordedMigrations(db: Kysely<Database>) {
  const { rows } = await sql<{ table: string | null }>`
    SELECT to_regclass(${MIGRATION_TABLE})::text AS table
  `.execute(db);
  if (!rows[0]?.table) {
    return [];
  }
  const recorded = await sql<{ name: string }>`
    SELECT name FROM ${sql.table(MIGRATION_TABLE)}
  `.execute(db);
  return recorded.rows.map((row) => row.name);
}

export async function migrateToLatest(db: Kysely<Database>) {
  const unknown = (await recordedMigrations(db)).filter(
    (name) => !(name in MIGRATIONS),
  );
  if (unknown.length > 0) {
    throw new DatabaseTooNewError(unknown);
  }
  return applied(await createMigrator(db).migrateToLatest());
}

export async function migrateTo(db: Kysely<Database>, migrationName: string) {
  return applied(await createMigrator(db).migrateTo(migrationName));
}

function createMigrator(db: Kysely<Database>) {
  return new Migrator({
    db,
    provider: { getMigrations: async () => MIGRATIONS },
    migrationTableName: MIGRATION_TABLE,
    migrationLockTableName: `${MIGRATION_TABLE}_lock`,
  });
}

function applied({ error, results = [] }: MigrationResultSet) {
  if (error) {
    throw error;
  }
  return {
    applied: results
      .filter((result) => result.status === "Success")
      .map((result) => result.migrationName),
  };
}
