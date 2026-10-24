import type { Database, MembershipRole } from "@cotolk/db";
import type { Kysely } from "kysely";
import { ForbiddenError, NotFoundError } from "./errors";
import type { Principal } from "./principal";

export interface OrganizationAccess {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  role: MembershipRole;
}

export async function accessOrganization(
  db: Kysely<Database>,
  principal: Principal,
  slug: string,
): Promise<OrganizationAccess> {
  const organization = await db
    .selectFrom("organizations")
    .select(["id", "slug", "name", "createdAt"])
    .where("slug", "=", slug)
    .executeTakeFirst();
  if (organization && principal.kind === "apiToken") {
    if (organization.id === principal.organizationId) {
      return { ...organization, role: "member" };
    }
  }
  if (organization && principal.kind === "user") {
    const membership = await db
      .selectFrom("memberships")
      .select("role")
      .where("organizationId", "=", organization.id)
      .where("userId", "=", principal.userId)
      .executeTakeFirst();
    if (membership) {
      return { ...organization, role: membership.role };
    }
  }
  throw new NotFoundError(`Organization ${slug}`);
}

export async function accessOrganizationAsOwner(
  db: Kysely<Database>,
  principal: Principal,
  slug: string,
  action: string,
) {
  const organization = await accessOrganization(db, principal, slug);
  if (principal.kind !== "user" || organization.role !== "owner") {
    throw new ForbiddenError(action);
  }
  return { organization, userId: principal.userId };
}

export function requireUser(principal: Principal, action: string) {
  if (principal.kind !== "user") {
    throw new ForbiddenError(action);
  }
  return principal.userId;
}
