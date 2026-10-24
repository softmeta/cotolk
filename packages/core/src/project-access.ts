import type { Database } from "@cotolk/db";
import type { Kysely } from "kysely";
import { z } from "zod";
import { accessOrganization } from "./access";
import { NotFoundError } from "./errors";
import { localeSchema } from "./inputs";
import type { Principal } from "./principal";

export async function accessProject(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  projectSlug: string,
) {
  const organization = await accessOrganization(
    db,
    principal,
    organizationSlug,
  );
  const project = await db
    .selectFrom("projects")
    .select(["id", "sourceLocale", "targetLocales"])
    .where("organizationId", "=", organization.id)
    .where("slug", "=", projectSlug)
    .executeTakeFirst();
  if (!project) {
    throw new NotFoundError(`Project ${projectSlug}`);
  }
  return project;
}

export function requireTargetLocale(
  project: { targetLocales: string[] },
  locale: string,
) {
  const canonical = localeSchema.parse(locale);
  if (!project.targetLocales.includes(canonical)) {
    throw new NotFoundError(`Target locale ${canonical}`);
  }
  return canonical;
}

export async function findKey(
  db: Kysely<Database>,
  projectId: string,
  keyId: string,
) {
  const key = z.uuid().safeParse(keyId).success
    ? await db
        .selectFrom("keys")
        .innerJoin("namespaces", "namespaces.id", "keys.namespaceId")
        .select(["keys.id", "keys.plural", "keys.sourceHash"])
        .where("keys.id", "=", keyId)
        .where("namespaces.projectId", "=", projectId)
        .executeTakeFirst()
    : undefined;
  if (!key) {
    throw new NotFoundError(`Key ${keyId}`);
  }
  return key;
}
