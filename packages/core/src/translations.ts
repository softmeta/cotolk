import type {
  Database,
  Forms,
  RevisionKind,
  TranslationOrigin,
  TranslationStatus,
} from "@cotolk/db";
import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import { resolveActor } from "./actor";
import { ConflictError, ForbiddenError } from "./errors";
import { formsSchema, validateForms } from "./forms";
import type { Principal } from "./principal";
import { accessProject, findKey, requireTargetLocale } from "./project-access";
import { recordRevision } from "./revisions";
import {
  type TranslationEvent,
  type TranslationState,
  transitionTranslation,
} from "./translation-state";

const submitInput = z.object({
  forms: formsSchema,
  reason: z.string().max(2000).optional(),
  approve: z.boolean().optional(),
  expectedRevision: z.number().int().min(0).optional(),
});

const reviewInput = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(2000).optional(),
  expectedRevision: z.number().int().min(0).optional(),
});

export interface KeyTranslation {
  locale: string;
  forms: Forms | null;
  status: TranslationStatus;
  origin: TranslationOrigin | null;
  revision: number;
}

export interface TranslationKey {
  id: string;
  namespace: string;
  path: string[];
  plural: boolean;
  sourceForms: Forms;
  description: string | null;
  translation: KeyTranslation;
}

const MISSING: TranslationState = {
  forms: null,
  status: "missing",
  origin: null,
  translatedFromHash: null,
};

export async function listKeys(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  projectSlug: string,
  locale: string,
): Promise<TranslationKey[]> {
  const project = await accessProject(
    db,
    principal,
    organizationSlug,
    projectSlug,
  );
  const target = requireTargetLocale(project, locale);
  const rows = await db
    .selectFrom("keys")
    .innerJoin("namespaces", "namespaces.id", "keys.namespaceId")
    .leftJoin("translations", (join) =>
      join
        .onRef("translations.keyId", "=", "keys.id")
        .on("translations.locale", "=", target),
    )
    .select([
      "keys.id",
      "namespaces.name as namespace",
      "keys.path",
      "keys.plural",
      "keys.sourceForms",
      "keys.description",
      "translations.forms",
      "translations.status",
      "translations.origin",
      "translations.revision",
    ])
    .where("namespaces.projectId", "=", project.id)
    .orderBy("namespaces.name")
    .orderBy("keys.path")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    namespace: row.namespace,
    path: row.path,
    plural: row.plural,
    sourceForms: row.sourceForms,
    description: row.description,
    translation: {
      locale: target,
      forms: row.forms ?? null,
      status: row.status ?? "missing",
      origin: row.origin ?? null,
      revision: row.revision ?? 0,
    },
  }));
}

async function lockTranslation(
  trx: Transaction<Database>,
  projectId: string,
  keyId: string,
  locale: string,
) {
  const key = await findKey(trx, projectId, keyId);
  await trx
    .insertInto("translations")
    .values({ keyId: key.id, locale, status: "missing", revision: 0 })
    .onConflict((conflict) => conflict.columns(["keyId", "locale"]).doNothing())
    .execute();
  const translation = await trx
    .selectFrom("translations")
    .selectAll()
    .where("keyId", "=", key.id)
    .where("locale", "=", locale)
    .forUpdate()
    .executeTakeFirstOrThrow();
  return { key, translation };
}

function checkRevision(current: number, expected: number | undefined) {
  if (expected !== undefined && expected !== current) {
    throw new ConflictError(
      `Translation is at revision ${current}, not ${expected}`,
    );
  }
}

async function applyEvent(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  projectSlug: string,
  keyId: string,
  locale: string,
  options: {
    expectedRevision?: number;
    reason?: string;
    kind: RevisionKind;
    event: (key: {
      plural: boolean;
      sourceHash: string;
      locale: string;
    }) => TranslationEvent;
  },
) {
  const project = await accessProject(
    db,
    principal,
    organizationSlug,
    projectSlug,
  );
  const target = requireTargetLocale(project, locale);
  const actor = await resolveActor(db, principal);
  return db.transaction().execute(async (trx) => {
    const { key, translation } = await lockTranslation(
      trx,
      project.id,
      keyId,
      target,
    );
    checkRevision(translation.revision, options.expectedRevision);
    const event = options.event({ ...key, locale: target });
    const transition = transitionTranslation(
      translation.status === "missing" ? MISSING : translation,
      event,
    );
    if (transition.kind === "suggest" && event.type === "submit") {
      await recordRevision(
        trx,
        translation.id,
        translation.revision,
        "suggest",
        {
          forms: event.forms,
          status: translation.status,
          origin: event.origin,
          reason: options.reason,
        },
        actor,
      );
      return { outcome: "suggested" as const, revision: translation.revision };
    }
    if (transition.kind !== "apply") {
      return { outcome: "unchanged" as const, revision: translation.revision };
    }
    const revision = translation.revision + 1;
    const { state } = transition;
    await trx
      .updateTable("translations")
      .set({
        forms: state.forms === null ? null : JSON.stringify(state.forms),
        status: state.status,
        origin: state.origin,
        translatedFromHash: state.translatedFromHash,
        revision,
        updatedAt: new Date(),
      })
      .where("id", "=", translation.id)
      .execute();
    await recordRevision(
      trx,
      translation.id,
      revision,
      options.kind,
      { ...state, reason: options.reason },
      actor,
    );
    return { outcome: "applied" as const, revision, status: state.status };
  });
}

export async function submitTranslation(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  projectSlug: string,
  keyId: string,
  locale: string,
  input: z.input<typeof submitInput>,
) {
  const { forms, reason, approve, expectedRevision } = submitInput.parse(input);
  const origin: TranslationOrigin =
    principal.kind === "user" ? "human" : "agent";
  if (approve && origin !== "human") {
    throw new ForbiddenError("approve translations");
  }
  return applyEvent(
    db,
    principal,
    organizationSlug,
    projectSlug,
    keyId,
    locale,
    {
      expectedRevision,
      reason,
      kind: "submit",
      event: (key) => ({
        type: "submit",
        forms: validateForms(key.plural, key.locale, forms),
        origin,
        sourceHash: key.sourceHash,
        approve,
      }),
    },
  );
}

export async function reviewTranslation(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  projectSlug: string,
  keyId: string,
  locale: string,
  input: z.input<typeof reviewInput>,
) {
  const { decision, reason, expectedRevision } = reviewInput.parse(input);
  if (principal.kind !== "user") {
    await accessProject(db, principal, organizationSlug, projectSlug);
    throw new ForbiddenError("review translations");
  }
  return applyEvent(
    db,
    principal,
    organizationSlug,
    projectSlug,
    keyId,
    locale,
    {
      expectedRevision,
      reason,
      kind: decision,
      event: (key) => ({
        type: "review",
        decision,
        sourceHash: key.sourceHash,
      }),
    },
  );
}
