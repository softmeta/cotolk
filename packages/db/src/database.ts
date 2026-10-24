import { CamelCasePlugin, type Dialect, Kysely } from "kysely";
import type { Database } from "./schema";

export function createDatabase(dialect: Dialect) {
  return new Kysely<Database>({ dialect, plugins: [new CamelCasePlugin()] });
}
