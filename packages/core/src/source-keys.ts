import type { Database } from "@cotolk/db";
import { type Kysely, sql, type Transaction } from "kysely";
import { z } from "zod";
import { type Actor, resolveActor } from "./actor";
import {
  canonicalForms,
  formsSchema,
  sourceHash,
  validateForms,
} from "./forms";
import type { Principal } from "./principal";
import { accessProject } from "./project-access";
import { recordRevision } from "./revisions";
import { transitionTranslation } from "./translation-state";

const messageSchema = z.object({
  path: z.array(z.string().min(1)).min(1),
  value: z.union([z.string(), z.object({ plural: formsSchema })]),
  description: z.string().max(2000).optional(),
});

const putKeysInput = z.object({
  namespace: z.string().min(1).max(200),
  messages: z.array(messageSchema),
});

export async function putKeys(
  db: Kysely<Database>,
  principal: Principal,
  organizationSlug: string,
  projectSlug: string,
  input: z.input<typeof putKeysInput>,
) {
  const project = await accessProject(
    db,
    principal,
    organizationSlug,
    projectSlug,
  );
  const { namespace, messages } = putKeysInput.parse(input);
  const actor = await resolveActor(db, principal);
  return db.transaction().execute(async (trx) => {
    await trx
      .insertInto("namespaces")
      .values({ projectId: project.id, name: namespace })
      .onConflict((conflict) =>
        conflict.columns(["projectId", "name"]).doNothing(),
      )
      .execute();
    const { id: namespaceId } = await trx
      .selectFrom("namespaces")
      .select("id")
      .where("projectId", "=", project.id)
      .where("name", "=", namespace)
      .executeTakeFirstOrThrow();
    const counts = { created: 0, updated: 0, unchanged: 0, staled: 0 };
    for (const message of messages) {
      const plural = typeof message.value !== "string";
      const forms = canonicalForms(
        typeof message.value === "string"
          ? { other: message.value }
          : message.value.plural,
      );
      validateForms(plural, project.sourceLocale, forms);
      const hash = sourceHash(plural, forms);
      const existing = await trx
        .selectFrom("keys")
        .select(["id", "sourceHash"])
        .where("namespaceId", "=", namespaceId)
        .where(sql<boolean>`path = ${sql.val(message.path)}::text[]`)
        .forUpdate()
        .executeTakeFirst();
      const values = {
        plural,
        sourceForms: JSON.stringify(forms),
        sourceHash: hash,
        description: message.description ?? null,
      };
      if (!existing) {
        await trx
          .insertInto("keys")
          .values({ ...values, namespaceId, path: message.path })
          .execute();
        counts.created += 1;
        continue;
      }
      if (existing.sourceHash === hash) {
        counts.unchanged += 1;
        continue;
      }
      await trx
        .updateTable("keys")
        .set({ ...values, updatedAt: new Date() })
        .where("id", "=", existing.id)
        .execute();
      counts.updated += 1;
      counts.staled += await staleTranslations(trx, existing.id, hash, actor);
    }
    return counts;
  });
}

async function staleTranslations(
  trx: Transaction<Database>,
  keyId: string,
  hash: string,
  actor: Actor,
) {
  const translations = await trx
    .selectFrom("translations")
    .selectAll()
    .where("keyId", "=", keyId)
    .forUpdate()
    .execute();
  let staled = 0;
  for (const translation of translations) {
    const transition = transitionTranslation(translation, {
      type: "sourceChanged",
      sourceHash: hash,
    });
    if (transition.kind !== "apply") {
      continue;
    }
    const revision = translation.revision + 1;
    await trx
      .updateTable("translations")
      .set({ status: transition.state.status, revision, updatedAt: new Date() })
      .where("id", "=", translation.id)
      .execute();
    await recordRevision(
      trx,
      translation.id,
      revision,
      "source_changed",
      transition.state,
      actor,
    );
    staled += 1;
  }
  return staled;
}
