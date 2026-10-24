import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>) {
  await db.schema
    .createTable("namespaces")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("project_id", "uuid", (column) =>
      column.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("namespaces_project_name_unique", [
      "project_id",
      "name",
    ])
    .execute();
  await db.schema
    .createTable("keys")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("namespace_id", "uuid", (column) =>
      column.notNull().references("namespaces.id").onDelete("cascade"),
    )
    .addColumn("path", sql`text[]`, (column) => column.notNull())
    .addColumn("plural", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("source_forms", "jsonb", (column) => column.notNull())
    .addColumn("source_hash", "text", (column) => column.notNull())
    .addColumn("description", "text")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("keys_namespace_path_unique", ["namespace_id", "path"])
    .execute();
  await db.schema
    .createTable("translations")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("key_id", "uuid", (column) =>
      column.notNull().references("keys.id").onDelete("cascade"),
    )
    .addColumn("locale", "text", (column) => column.notNull())
    .addColumn("forms", "jsonb")
    .addColumn("status", "text", (column) =>
      column
        .notNull()
        .check(
          sql`status IN ('missing', 'needs_review', 'approved', 'rejected', 'stale')`,
        ),
    )
    .addColumn("origin", "text", (column) =>
      column.check(sql`origin IN ('human', 'agent', 'tm', 'import')`),
    )
    .addColumn("translated_from_hash", "text")
    .addColumn("revision", "integer", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("translations_key_locale_unique", ["key_id", "locale"])
    .execute();
  await db.schema
    .createTable("translation_revisions")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("translation_id", "uuid", (column) =>
      column.notNull().references("translations.id").onDelete("cascade"),
    )
    .addColumn("revision", "integer", (column) => column.notNull())
    .addColumn("kind", "text", (column) =>
      column
        .notNull()
        .check(
          sql`kind IN ('submit', 'suggest', 'approve', 'reject', 'source_changed')`,
        ),
    )
    .addColumn("forms", "jsonb")
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("origin", "text")
    .addColumn("reason", "text")
    .addColumn("actor_kind", "text", (column) =>
      column
        .notNull()
        .check(sql`actor_kind IN ('user', 'api_token', 'system')`),
    )
    .addColumn("actor_user_id", "uuid", (column) =>
      column.references("users.id").onDelete("set null"),
    )
    .addColumn("actor_token_id", "uuid", (column) =>
      column.references("api_tokens.id").onDelete("set null"),
    )
    .addColumn("actor_name", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await db.schema
    .createIndex("translation_revisions_translation_idx")
    .on("translation_revisions")
    .columns(["translation_id", "revision"])
    .execute();
  await sql`
    CREATE FUNCTION cotolk_translation_revisions_append_only() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF (to_jsonb(NEW) - 'actor_user_id' - 'actor_token_id')
         IS DISTINCT FROM (to_jsonb(OLD) - 'actor_user_id' - 'actor_token_id') THEN
        RAISE EXCEPTION 'translation revisions are append-only';
      END IF;
      RETURN NEW;
    END;
    $$
  `.execute(db);
  await sql`
    CREATE TRIGGER translation_revisions_append_only
    BEFORE UPDATE ON translation_revisions
    FOR EACH ROW EXECUTE FUNCTION cotolk_translation_revisions_append_only()
  `.execute(db);
}
