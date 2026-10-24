import {
  authenticate,
  createApiToken,
  createOrganization,
  createUser,
  type Principal,
  signIn,
} from "@cotolk/core";
import type { Database } from "@cotolk/db";
import type { Kysely } from "kysely";
import { PASSWORD } from "./database";

export async function signedInUser(db: Kysely<Database>, handle: string) {
  const email = `${handle}@example.invalid`;
  await createUser(db, { email, name: handle, password: PASSWORD });
  const { sessionToken } = await signIn(db, { email, password: PASSWORD });
  return authenticate(db, sessionToken);
}

export async function tenant(db: Kysely<Database>, slug: string) {
  const owner = await signedInUser(db, `${slug}-owner`);
  await createOrganization(db, owner, { slug, name: slug });
  const { secret, id: tokenId } = await createApiToken(db, owner, slug, {
    name: `${slug} CI`,
  });
  const token: Principal = await authenticate(db, secret);
  return { slug, owner, token, tokenId };
}
