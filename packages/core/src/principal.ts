import type { Database } from "@cotolk/db";
import type { Kysely } from "kysely";
import { UnauthenticatedError } from "./errors";
import { hashSecret, secretKind } from "./secrets";

export type Principal =
  | { kind: "user"; userId: string }
  | { kind: "apiToken"; tokenId: string; organizationId: string };

export async function authenticate(
  db: Kysely<Database>,
  secret: string,
  now = new Date(),
): Promise<Principal> {
  const kind = secretKind(secret);
  const tokenHash = hashSecret(secret);
  if (kind === "session") {
    const session = await db
      .selectFrom("userSessions")
      .select("userId")
      .where("tokenHash", "=", tokenHash)
      .where("expiresAt", ">", now)
      .executeTakeFirst();
    if (session) {
      return { kind: "user", userId: session.userId };
    }
  }
  if (kind === "apiToken") {
    const token = await db
      .updateTable("apiTokens")
      .set({ lastUsedAt: now })
      .where("tokenHash", "=", tokenHash)
      .where("revokedAt", "is", null)
      .returning(["id", "organizationId"])
      .executeTakeFirst();
    if (token) {
      return {
        kind: "apiToken",
        tokenId: token.id,
        organizationId: token.organizationId,
      };
    }
  }
  throw new UnauthenticatedError("Invalid or expired credentials");
}
