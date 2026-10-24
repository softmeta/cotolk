import type { ActorKind, Database, TranslationOrigin } from "@cotolk/db";
import type { Kysely } from "kysely";
import type { Principal } from "./principal";

export interface Actor {
  kind: ActorKind;
  userId: string | null;
  tokenId: string | null;
  name: string;
  origin: TranslationOrigin;
}

export async function resolveActor(
  db: Kysely<Database>,
  principal: Principal,
): Promise<Actor> {
  if (principal.kind === "user") {
    const user = await db
      .selectFrom("users")
      .select("name")
      .where("id", "=", principal.userId)
      .executeTakeFirstOrThrow();
    return {
      kind: "user",
      userId: principal.userId,
      tokenId: null,
      name: user.name,
      origin: "human",
    };
  }
  const token = await db
    .selectFrom("apiTokens")
    .select("name")
    .where("id", "=", principal.tokenId)
    .executeTakeFirstOrThrow();
  return {
    kind: "api_token",
    userId: null,
    tokenId: principal.tokenId,
    name: token.name,
    origin: "agent",
  };
}
