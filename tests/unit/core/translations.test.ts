import {
  ConflictError,
  createProject,
  ForbiddenError,
  listKeys,
  listRevisions,
  NotFoundError,
  putKeys,
  reviewTranslation,
  submitTranslation,
  ValidationError,
} from "@cotolk/core";
import { sql } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { openMigratedDatabase } from "./database";
import { tenant } from "./fixtures";

type Tenant = Awaited<ReturnType<typeof tenant>>;

let db: Awaited<ReturnType<typeof openMigratedDatabase>>;
let acme: Tenant;

beforeEach(async () => {
  db = await openMigratedDatabase();
  acme = await tenant(db, "acme");
  await createProject(db, acme.owner, "acme", {
    slug: "shop",
    name: "Shop",
    sourceLocale: "en-US",
    targetLocales: ["es", "ru", "ja"],
  });
});

const put = (messages: Parameters<typeof putKeys>[4]["messages"]) =>
  putKeys(db, acme.token, "acme", "shop", { namespace: "common", messages });

async function keyId(path: string[]) {
  const keys = await listKeys(db, acme.owner, "acme", "shop", "es");
  const key = keys.find((entry) => entry.path.join(".") === path.join("."));
  if (!key) throw new Error(`no key ${path.join(".")}`);
  return key.id;
}

describe("source keys", () => {
  it("creates keys once and reports unchanged sources", async () => {
    expect(
      await put([
        { path: ["greeting"], value: "Hello" },
        {
          path: ["cart", "items"],
          value: { plural: { one: "# item", other: "# items" } },
        },
      ]),
    ).toEqual({ created: 2, updated: 0, unchanged: 0, staled: 0 });
    expect(await put([{ path: ["greeting"], value: "Hello" }])).toEqual({
      created: 0,
      updated: 0,
      unchanged: 1,
      staled: 0,
    });

    const keys = await listKeys(db, acme.token, "acme", "shop", "es");
    expect(
      keys.map((key) => [key.path, key.plural, key.translation.status]),
    ).toEqual([
      [["cart", "items"], true, "missing"],
      [["greeting"], false, "missing"],
    ]);
  });

  it("marks translations stale when their source changes and records why", async () => {
    await put([{ path: ["greeting"], value: "Hello" }]);
    const id = await keyId(["greeting"]);
    await submitTranslation(db, acme.owner, "acme", "shop", id, "es", {
      forms: { other: "Hola" },
      approve: true,
    });

    expect(await put([{ path: ["greeting"], value: "Hello there" }])).toEqual({
      created: 0,
      updated: 1,
      unchanged: 0,
      staled: 1,
    });

    const [key] = await listKeys(db, acme.owner, "acme", "shop", "es");
    expect(key?.translation).toMatchObject({
      status: "stale",
      forms: { other: "Hola" },
      revision: 2,
    });
    const revisions = await listRevisions(
      db,
      acme.owner,
      "acme",
      "shop",
      id,
      "es",
    );
    expect(
      revisions.map((entry) => [entry.kind, entry.status, entry.actor]),
    ).toEqual([
      ["submit", "approved", { kind: "user", name: "acme-owner" }],
      ["source_changed", "stale", { kind: "api_token", name: "acme CI" }],
    ]);

    const confirmed = await reviewTranslation(
      db,
      acme.owner,
      "acme",
      "shop",
      id,
      "es",
      {
        decision: "approve",
      },
    );
    expect(confirmed).toMatchObject({ outcome: "applied", status: "approved" });
    expect(
      await put([{ path: ["greeting"], value: "Hello there" }]),
    ).toMatchObject({
      unchanged: 1,
      staled: 0,
    });
  });
});

describe("translations", () => {
  it("puts an agent translation up for review and approves it", async () => {
    await put([{ path: ["greeting"], value: "Hello" }]);
    const id = await keyId(["greeting"]);

    expect(
      await submitTranslation(db, acme.token, "acme", "shop", id, "es", {
        forms: { other: "Hola" },
        reason: "Common greeting",
      }),
    ).toEqual({ outcome: "applied", revision: 1, status: "needs_review" });
    await expect(
      reviewTranslation(db, acme.token, "acme", "shop", id, "es", {
        decision: "approve",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      submitTranslation(db, acme.token, "acme", "shop", id, "es", {
        forms: { other: "Hola" },
        approve: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await reviewTranslation(db, acme.owner, "acme", "shop", id, "es", {
      decision: "approve",
      expectedRevision: 1,
    });

    const revisions = await listRevisions(
      db,
      acme.owner,
      "acme",
      "shop",
      id,
      "es",
    );
    expect(
      revisions.map(({ revision, kind, status, origin, reason }) => ({
        revision,
        kind,
        status,
        origin,
        reason,
      })),
    ).toEqual([
      {
        revision: 1,
        kind: "submit",
        status: "needs_review",
        origin: "agent",
        reason: "Common greeting",
      },
      {
        revision: 2,
        kind: "approve",
        status: "approved",
        origin: "agent",
        reason: null,
      },
    ]);
  });

  it("keeps a person's translation and files an agent's resubmission as a suggestion", async () => {
    await put([{ path: ["greeting"], value: "Hello" }]);
    const id = await keyId(["greeting"]);
    await submitTranslation(db, acme.owner, "acme", "shop", id, "es", {
      forms: { other: "¡Hola!" },
      approve: true,
    });

    expect(
      await submitTranslation(db, acme.token, "acme", "shop", id, "es", {
        forms: { other: "Hola" },
      }),
    ).toEqual({ outcome: "suggested", revision: 1 });

    const [key] = await listKeys(db, acme.owner, "acme", "shop", "es");
    expect(key?.translation).toMatchObject({
      forms: { other: "¡Hola!" },
      status: "approved",
      origin: "human",
      revision: 1,
    });
    const revisions = await listRevisions(
      db,
      acme.owner,
      "acme",
      "shop",
      id,
      "es",
    );
    expect(revisions.at(-1)).toMatchObject({
      kind: "suggest",
      forms: { other: "Hola" },
      origin: "agent",
    });
  });

  it("requires exactly the plural forms the target locale uses", async () => {
    await put([
      {
        path: ["items"],
        value: { plural: { one: "# item", other: "# items" } },
      },
    ]);
    const id = await keyId(["items"]);
    const submit = (locale: string, forms: Record<string, string>) =>
      submitTranslation(db, acme.token, "acme", "shop", id, locale, { forms });

    await expect(
      submit("ru", { one: "# товар", other: "# товара" }),
    ).rejects.toThrow(
      new ValidationError(
        "ru needs forms one, few, many, other; missing few, many, unexpected none",
      ),
    );
    await expect(
      submit("ru", {
        one: "# товар",
        few: "# товара",
        many: "# товаров",
        other: "# товара",
      }),
    ).resolves.toMatchObject({ outcome: "applied" });
    await expect(
      submit("ja", { one: "#", other: "# 個" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(submit("ja", { other: "# 個" })).resolves.toMatchObject({
      outcome: "applied",
    });
    await expect(submit("fr", { other: "# articles" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("refuses a write based on an outdated revision", async () => {
    await put([{ path: ["greeting"], value: "Hello" }]);
    const id = await keyId(["greeting"]);
    await submitTranslation(db, acme.token, "acme", "shop", id, "es", {
      forms: { other: "Hola" },
    });

    await expect(
      submitTranslation(db, acme.owner, "acme", "shop", id, "es", {
        forms: { other: "Buenas" },
        expectedRevision: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      reviewTranslation(db, acme.owner, "acme", "shop", id, "es", {
        decision: "reject",
        expectedRevision: 1,
        reason: "Too informal",
      }),
    ).resolves.toMatchObject({ status: "rejected" });
  });

  it("keeps revisions append-only while letting actors be deleted", async () => {
    await put([{ path: ["greeting"], value: "Hello" }]);
    const id = await keyId(["greeting"]);
    await submitTranslation(db, acme.owner, "acme", "shop", id, "es", {
      forms: { other: "Hola" },
    });

    await expect(
      sql`UPDATE translation_revisions SET reason = 'rewritten'`.execute(db),
    ).rejects.toThrow(/append-only/);
    await db.deleteFrom("users").execute();

    const revisions = await db
      .selectFrom("translationRevisions")
      .selectAll()
      .execute();
    expect(revisions).toEqual([
      expect.objectContaining({
        actorUserId: null,
        actorName: "acme-owner",
        reason: null,
      }),
    ]);
  });
});
