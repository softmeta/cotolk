import type {
  ActorKind,
  Database,
  Forms,
  RevisionKind,
  TranslationOrigin,
  TranslationStatus,
} from "@cotolk/db";
import type { Kysely, Transaction } from "kysely";
import type { Actor } from "./actor";
import type { Principal } from "./principal";
import { accessProject, findKey, requireTargetLocale } from "./project-access";

export interface TranslationRevision {
  revision: number;
  kind: RevisionKind;
  forms: Forms | null;
  status: TranslationStatus;
  origin: TranslationOrigin | null;
  reason: string | null;
  actor: { kind: ActorKind; name: string };
  createdAt: Date;
}

export async function recordRevision(
  trx: Transaction<Database>,
  translationId: string,
  revision: number,
  kind: RevisionKind,
  entry: {
    forms: Forms | null;
    status: TranslationStatus;
    origin: TranslationOrigin | null;
    reason?: string;
  },
  actor: Pick<Actor, "kind" | "userId" | "tokenId" | "name">,
) {
  await trx
    .insertInto("translationRevisions")
    .values({
      translationId,
      revision,
      kind,
      forms: entry.forms === null ? null : JSON.stringify(entry.forms),
      status: entry.status,
      origin: entry.origin,
      reason: entry.reason ?? null,
      actorKind: actor.kind,
      actorUserId: actor.userId,
      actorTokenId: actor.tokenId,
      actorName: actor.name,
    })
    .execute();
}

export async function listRevisions(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  projectSlug: string,
  keyId: string,
  locale: string,
): Promise<TranslationRevision[]> {
  const project = await accessProject(
    db,
    principal,
    organizationSlug,
    projectSlug,
  );
  const target = requireTargetLocale(project, locale);
  await findKey(db, project.id, keyId);
  const rows = await db
    .selectFrom("translationRevisions")
    .innerJoin(
      "translations",
      "translations.id",
      "translationRevisions.translationId",
    )
    .innerJoin("keys", "keys.id", "translations.keyId")
    .innerJoin("namespaces", "namespaces.id", "keys.namespaceId")
    .select([
      "translationRevisions.revision",
      "translationRevisions.kind",
      "translationRevisions.forms",
      "translationRevisions.status",
      "translationRevisions.origin",
      "translationRevisions.reason",
      "translationRevisions.actorKind",
      "translationRevisions.actorName",
      "translationRevisions.createdAt",
    ])
    .where("namespaces.projectId", "=", project.id)
    .where("keys.id", "=", keyId)
    .where("translations.locale", "=", target)
    .orderBy("translationRevisions.createdAt")
    .orderBy("translationRevisions.revision")
    .execute();
  return rows.map(({ actorKind, actorName, ...row }) => ({
    ...row,
    actor: { kind: actorKind, name: actorName },
  }));
}
