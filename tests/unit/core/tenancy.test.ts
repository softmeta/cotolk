import {
  createApiToken,
  createProject,
  deleteOrganization,
  deleteProject,
  ForbiddenError,
  getOrganization,
  getProject,
  listApiTokens,
  listOrganizations,
  listProjects,
  NotFoundError,
  type Principal,
  revokeApiToken,
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
}

const TABLES = [
  "organizations",
  "projects",
  "users",
  "memberships",
  "apiTokens",
  "userSessions",
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

const shop = { slug: "shop", name: "Shop", sourceLocale: "en-US" };

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
    world = { db, acme, globex };
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
