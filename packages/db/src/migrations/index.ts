import type { Migration } from "kysely/migration";
import * as organizationsAndProjects from "./0001_organizations_and_projects";
import * as accountsAndTokens from "./0002_accounts_and_tokens";
import * as keysAndTranslations from "./0003_keys_and_translations";

export const MIGRATIONS: Record<string, Migration> = {
  "0001_organizations_and_projects": organizationsAndProjects,
  "0002_accounts_and_tokens": accountsAndTokens,
  "0003_keys_and_translations": keysAndTranslations,
};
