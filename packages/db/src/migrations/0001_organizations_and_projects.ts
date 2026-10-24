import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>) {
  await db.schema
    .createTable("organizations")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("slug", "text", (column) => column.notNull().unique())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await db.schema
    .createTable("projects")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("organization_id", "uuid", (column) =>
      column.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("slug", "text", (column) => column.notNull())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("source_locale", "text", (column) => column.notNull())
    .addColumn("target_locales", sql`text[]`, (column) =>
      column.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn("format_config", "jsonb", (column) =>
      column.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("projects_organization_slug_unique", [
      "organization_id",
      "slug",
    ])
    .execute();
}
