import type { Migration } from "kysely/migration";
import * as organizationsAndProjects from "./0001_organizations_and_projects";

export const MIGRATIONS: Record<string, Migration> = {
  "0001_organizations_and_projects": organizationsAndProjects,
};
