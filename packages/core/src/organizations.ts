import type { Database, MembershipRole } from "@cotolk/db";
import type { Kysely } from "kysely";
import { z } from "zod";
import {
  accessOrganization,
  accessOrganizationAsOwner,
  requireUser,
} from "./access";
import { ConflictError, isUniqueViolation } from "./errors";
import { nameSchema, slugSchema } from "./inputs";
import type { Principal } from "./principal";

const createOrganizationInput = z.object({
  slug: slugSchema,
  name: nameSchema,
});

const updateOrganizationInput = z.object({ name: nameSchema.optional() });

export interface Organization {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  role: MembershipRole;
}

export async function createOrganization(
  db: Kysely<Database>,
  principal: Principal,
  input: z.input<typeof createOrganizationInput>,
): Promise<Organization> {
  const userId = requireUser(principal, "create organizations");
  const { slug, name } = createOrganizationInput.parse(input);
  try {
    return await db.transaction().execute(async (trx) => {
      const organization = await trx
        .insertInto("organizations")
        .values({ slug, name })
        .returning(["id", "slug", "name", "createdAt"])
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("memberships")
        .values({ organizationId: organization.id, userId, role: "owner" })
        .execute();
      return { ...organization, role: "owner" as const };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`Organization ${slug} already exists`);
    }
    throw error;
  }
}

export async function listOrganizations(
  db: Kysely<Database>,
  principal: Principal,
): Promise<Organization[]> {
  const query = db
    .selectFrom("organizations")
    .select([
      "organizations.id",
      "organizations.slug",
      "organizations.name",
      "organizations.createdAt",
    ])
    .orderBy("organizations.slug");
  if (principal.kind === "apiToken") {
    const rows = await query
      .where("organizations.id", "=", principal.organizationId)
      .execute();
    return rows.map((row) => ({ ...row, role: "member" as const }));
  }
  return query
    .innerJoin("memberships", "memberships.organizationId", "organizations.id")
    .select("memberships.role")
    .where("memberships.userId", "=", principal.userId)
    .execute();
}

export function getOrganization(
  db: Kysely<Database>,
  principal: Principal,
  slug: string,
): Promise<Organization> {
  return accessOrganization(db, principal, slug);
}

export async function updateOrganization(
  db: Kysely<Database>,
  principal: Principal,
  slug: string,
  input: z.input<typeof updateOrganizationInput>,
): Promise<Organization> {
  const { organization } = await accessOrganizationAsOwner(
    db,
    principal,
    slug,
    "update this organization",
  );
  const changes = updateOrganizationInput.parse(input);
  if (Object.keys(changes).length === 0) {
    return organization;
  }
  const updated = await db
    .updateTable("organizations")
    .set(changes)
    .where("id", "=", organization.id)
    .returning(["id", "slug", "name", "createdAt"])
    .executeTakeFirstOrThrow();
  return { ...updated, role: organization.role };
}

export async function deleteOrganization(
  db: Kysely<Database>,
  principal: Principal,
  slug: string,
) {
  const { organization } = await accessOrganizationAsOwner(
    db,
    principal,
    slug,
    "delete this organization",
  );
  await db
    .deleteFrom("organizations")
    .where("id", "=", organization.id)
    .execute();
}
