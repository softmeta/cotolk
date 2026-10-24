export { createDatabase } from "./database";
export {
  DatabaseTooNewError,
  LATEST_MIGRATION,
  migrateToLatest,
} from "./migrate";
export type { Database, OrganizationsTable, ProjectsTable } from "./schema";
