import type { Database } from "@cotolk/db";
import type { Kysely } from "kysely";
import { z } from "zod";
import { accessOrganizationAsOwner } from "./access";
import { NotFoundError } from "./errors";
import { nameSchema } from "./inputs";
import type { Principal } from "./principal";
import { generateSecret } from "./secrets";

const createApiTokenInput = z.object({ name: nameSchema });

const API_TOKEN_COLUMNS = [
  "id",
  "name",
  "createdAt",
  "lastUsedAt",
  "revokedAt",
] as const;

export interface ApiToken {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export async function createApiToken(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  input: z.input<typeof createApiTokenInput>,
): Promise<ApiToken & { secret: string }> {
  const { organization, userId } = await accessOrganizationAsOwner(
    db,
    principal,
    organizationSlug,
    "manage API tokens",
  );
  const { name } = createApiTokenInput.parse(input);
  const { secret, hash } = generateSecret("apiToken");
  const token = await db
    .insertInto("apiTokens")
    .values({
      organizationId: organization.id,
      name,
      tokenHash: hash,
      createdByUserId: userId,
    })
    .returning(API_TOKEN_COLUMNS)
    .executeTakeFirstOrThrow();
  return { ...token, secret };
}

export async function listApiTokens(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
): Promise<ApiToken[]> {
  const { organization } = await accessOrganizationAsOwner(
    db,
    principal,
    organizationSlug,
    "manage API tokens",
  );
  return db
    .selectFrom("apiTokens")
    .select(API_TOKEN_COLUMNS)
    .where("organizationId", "=", organization.id)
    .orderBy("createdAt")
    .execute();
}

export async function revokeApiToken(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  tokenId: string,
  now = new Date(),
): Promise<ApiToken> {
  const { organization } = await accessOrganizationAsOwner(
    db,
    principal,
    organizationSlug,
    "manage API tokens",
  );
  const token =
    z.uuid().safeParse(tokenId).success &&
    (await db
      .updateTable("apiTokens")
      .set((eb) => ({ revokedAt: eb.fn.coalesce("revokedAt", eb.val(now)) }))
      .where("organizationId", "=", organization.id)
      .where("id", "=", tokenId)
      .returning(API_TOKEN_COLUMNS)
      .executeTakeFirst());
  if (!token) {
    throw new NotFoundError(`API token ${tokenId}`);
  }
  return token;
}
