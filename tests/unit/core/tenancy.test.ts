import {
  createApiToken,
  createProject,
  deleteOrganization,
  deleteProject,
  ForbiddenError,
  getOrganization,
  getProject,
  listApiTokens,
  listKeys,
  listOrganizations,
  listProjects,
  listRevisions,
  NotFoundError,
  type Principal,
  putKeys,
  reviewTranslation,
  revokeApiToken,
  submitTranslation,
  updateOrganization,
  updateProject,
} from "@cotolk/core";
import type { Database } from "@cotolk/db";
import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { openMigratedDatabase } from "./database";
import { tenant } from "./fixtures";

type Tenant = Awaited<ReturnType<typeof tenant>>;

interface World {
  db: Kysely<Database>;
  acme: Tenant;
  globex: Tenant;
  acmeKeyId: string;
}

const TABLES = [
  "organizations",
  "projects",
  "users",
  "memberships",
  "apiTokens",
  "userSessions",
  "namespaces",
  "keys",
  "translations",
  "translationRevisions",
] as const;

async function snapshot(db: Kysely<Database>) {
  const tables = await Promise.all(
    TABLES.map((table) =>
      db
        .selectFrom(table)
        .selectAll()
        .execute()
        .then((rows) => rows.map((row) => JSON.stringify(row)).sort()),
    ),
  );
  return Object.fromEntries(TABLES.map((table, i) => [table, tables[i]]));
}

const shop = {
  slug: "shop",
  name: "Shop",
  sourceLocale: "en-US",
  targetLocales: ["es"],
};

type Operation = (world: World, intruder: Principal) => Promise<unknown>;

const AGAINST_VICTIM_ORGANIZATION: Record<string, Operation> = {
  getOrganization: ({ db }, p) => getOrganization(db, p, "acme"),
  updateOrganization: ({ db }, p) =>
    updateOrganization(db, p, "acme", { name: "Taken over" }),
  deleteOrganization: ({ db }, p) => deleteOrganization(db, p, "acme"),
  listProjects: ({ db }, p) => listProjects(db, p, "acme"),
  createProject: ({ db }, p) =>
    createProject(db, p, "acme", { ...shop, slug: "planted" }),
  getProject: ({ db }, p) => getProject(db, p, "acme", "shop"),
  updateProject: ({ db }, p) =>
    updateProject(db, p, "acme", "shop", { name: "Taken over" }),
  deleteProject: ({ db }, p) => deleteProject(db, p, "acme", "shop"),
  listApiTokens: ({ db }, p) => listApiTokens(db, p, "acme"),
  createApiToken: ({ db }, p) =>
    createApiToken(db, p, "acme", { name: "Planted" }),
  revokeApiToken: ({ db, acme }, p) =>
    revokeApiToken(db, p, "acme", acme.tokenId),
  putKeys: ({ db }, p) =>
    putKeys(db, p, "acme", "shop", {
      namespace: "common",
      messages: [{ path: ["greeting"], value: "Planted" }],
    }),
  listKeys: ({ db }, p) => listKeys(db, p, "acme", "shop", "es"),
  submitTranslation: ({ db, acmeKeyId }, p) =>
    submitTranslation(db, p, "acme", "shop", acmeKeyId, "es", {
      forms: { other: "Planted" },
    }),
  reviewTranslation: ({ db, acmeKeyId }, p) =>
    reviewTranslation(db, p, "acme", "shop", acmeKeyId, "es", {
      decision: "reject",
    }),
  listRevisions: ({ db, acmeKeyId }, p) =>
    listRevisions(db, p, "acme", "shop", acmeKeyId, "es"),
};

const THROUGH_OWN_ORGANIZATION: Record<string, Operation> = {
  "getProject of a victim-only slug": ({ db }, p) =>
    getProject(db, p, "globex", "acme-only"),
  "updateProject of a victim-only slug": ({ db }, p) =>
    updateProject(db, p, "globex", "acme-only", { name: "Taken over" }),
  "deleteProject of a victim-only slug": ({ db }, p) =>
    deleteProject(db, p, "globex", "acme-only"),
  "revokeApiToken of the victim's token": ({ db, acme }, p) =>
    revokeApiToken(db, p, "globex", acme.tokenId),
  "submitTranslation of the victim's key": ({ db, acmeKeyId }, p) =>
    submitTranslation(db, p, "globex", "shop", acmeKeyId, "es", {
      forms: { other: "Planted" },
    }),
  "reviewTranslation of the victim's key": ({ db, acmeKeyId }, p) =>
    reviewTranslation(db, p, "globex", "shop", acmeKeyId, "es", {
      decision: "reject",
    }),
  "listRevisions of the victim's key": ({ db, acmeKeyId }, p) =>
    listRevisions(db, p, "globex", "shop", acmeKeyId, "es"),
};

function refusedWithoutLeaking(error: unknown) {
  return error instanceof NotFoundError || error instanceof ForbiddenError;
}

describe("tenant isolation", () => {
  let world: World;

  beforeEach(async () => {
    const db = await openMigratedDatabase();
    const acme = await tenant(db, "acme");
    const globex = await tenant(db, "globex");
    await createProject(db, acme.owner, "acme", shop);
    await createProject(db, acme.owner, "acme", {
      ...shop,
      slug: "acme-only",
    });
    await createProject(db, globex.owner, "globex", shop);
    await putKeys(db, acme.owner, "acme", "shop", {
      namespace: "common",
      messages: [{ path: ["greeting"], value: "Hello" }],
    });
    const [key] = await listKeys(db, acme.owner, "acme", "shop", "es");
    if (!key) throw new Error("fixture key missing");
    await submitTranslation(db, acme.owner, "acme", "shop", key.id, "es", {
      forms: { other: "Hola" },
    });
    world = { db, acme, globex, acmeKeyId: key.id };
  });

  for (const intruderKind of ["owner", "token"] as const) {
    for (const [name, operation] of Object.entries(
      AGAINST_VICTIM_ORGANIZATION,
    )) {
      it(`${name} on another organization by its ${intruderKind} reports it missing and writes nothing`, async () => {
        const before = await snapshot(world.db);

        await expect(
          operation(world, world.globex[intruderKind]),
        ).rejects.toBeInstanceOf(NotFoundError);

        expect(await snapshot(world.db)).toEqual(before);
      });
    }

    for (const [name, operation] of Object.entries(THROUGH_OWN_ORGANIZATION)) {
      it(`${name} through the ${intruderKind}'s own organization is refused and writes nothing`, async () => {
        const before = await snapshot(world.db);

        await expect(
          operation(world, world.globex[intruderKind]),
        ).rejects.toSatisfy(refusedWithoutLeaking);

        expect(await snapshot(world.db)).toEqual(before);
      });
    }
  }

  it("never lists another organization", async () => {
    const { db, globex } = world;

    for (const principal of [globex.owner, globex.token]) {
      expect(
        (await listOrganizations(db, principal)).map((org) => org.slug),
      ).toEqual(["globex"]);
    }
  });
});
