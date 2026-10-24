import type { ColumnType, Generated } from "kysely";

type CreatedAt = ColumnType<Date, never, never>;
type Json = ColumnType<unknown, string | undefined, string>;

export interface OrganizationsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  createdAt: Generated<CreatedAt>;
}

export interface ProjectsTable {
  id: Generated<string>;
  organizationId: string;
  slug: string;
  name: string;
  sourceLocale: string;
  targetLocales: ColumnType<string[], string[] | undefined, string[]>;
  formatConfig: Json;
  createdAt: Generated<CreatedAt>;
}

export interface Database {
  organizations: OrganizationsTable;
  projects: ProjectsTable;
}
