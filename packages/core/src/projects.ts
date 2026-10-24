import type { Database } from "@cotolk/db";
import type { Kysely } from "kysely";
import { z } from "zod";
import { accessOrganization, accessOrganizationAsOwner } from "./access";
import { ConflictError, isUniqueViolation, NotFoundError } from "./errors";
import { localeSchema, nameSchema, slugSchema } from "./inputs";
import type { Principal } from "./principal";

const formatConfigSchema = z.record(z.string(), z.unknown());

const createProjectInput = z.object({
  slug: slugSchema,
  name: nameSchema,
  sourceLocale: localeSchema,
  targetLocales: z.array(localeSchema).default([]),
  formatConfig: formatConfigSchema.default({}),
});

const updateProjectInput = z.object({
  name: nameSchema.optional(),
  sourceLocale: localeSchema.optional(),
  targetLocales: z.array(localeSchema).optional(),
  formatConfig: formatConfigSchema.optional(),
});

const PROJECT_COLUMNS = [
  "id",
  "slug",
  "name",
  "sourceLocale",
  "targetLocales",
  "formatConfig",
  "createdAt",
] as const;

export interface Project {
  id: string;
  slug: string;
  name: string;
  sourceLocale: string;
  targetLocales: string[];
  formatConfig: unknown;
  createdAt: Date;
}

export async function createProject(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  input: z.input<typeof createProjectInput>,
): Promise<Project> {
  const organization = await accessOrganization(
    db,
    principal,
    organizationSlug,
  );
  const { formatConfig, ...project } = createProjectInput.parse(input);
  try {
    return await db
      .insertInto("projects")
      .values({
        ...project,
        organizationId: organization.id,
        formatConfig: JSON.stringify(formatConfig),
      })
      .returning(PROJECT_COLUMNS)
      .executeTakeFirstOrThrow();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`Project ${project.slug} already exists`);
    }
    throw error;
  }
}

export async function listProjects(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
): Promise<Project[]> {
  const organization = await accessOrganization(
    db,
    principal,
    organizationSlug,
  );
  return db
    .selectFrom("projects")
    .select(PROJECT_COLUMNS)
    .where("organizationId", "=", organization.id)
    .orderBy("slug")
    .execute();
}

async function findProject(
  db: Kysely<Database>,
  organizationId: string,
  slug: string,
) {
  const project = await db
    .selectFrom("projects")
    .select(PROJECT_COLUMNS)
    .where("organizationId", "=", organizationId)
    .where("slug", "=", slug)
    .executeTakeFirst();
  if (!project) {
    throw new NotFoundError(`Project ${slug}`);
  }
  return project;
}

export async function getProject(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  slug: string,
): Promise<Project> {
  const organization = await accessOrganization(
    db,
    principal,
    organizationSlug,
  );
  return findProject(db, organization.id, slug);
}

export async function updateProject(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  slug: string,
  input: z.input<typeof updateProjectInput>,
): Promise<Project> {
  const organization = await accessOrganization(
    db,
    principal,
    organizationSlug,
  );
  const project = await findProject(db, organization.id, slug);
  const { formatConfig, ...changes } = updateProjectInput.parse(input);
  const values = {
    ...changes,
    ...(formatConfig && { formatConfig: JSON.stringify(formatConfig) }),
  };
  if (Object.keys(values).length === 0) {
    return project;
  }
  return db
    .updateTable("projects")
    .set(values)
    .where("id", "=", project.id)
    .returning(PROJECT_COLUMNS)
    .executeTakeFirstOrThrow();
}

export async function deleteProject(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  slug: string,
) {
  const { organization } = await accessOrganizationAsOwner(
    db,
    principal,
    organizationSlug,
    "delete projects",
  );
  const project = await findProject(db, organization.id, slug);
  await db.deleteFrom("projects").where("id", "=", project.id).execute();
}
