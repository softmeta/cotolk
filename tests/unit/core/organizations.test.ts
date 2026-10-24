import {
  authenticate,
  ConflictError,
  createApiToken,
  createOrganization,
  createProject,
  deleteOrganization,
  deleteProject,
  ForbiddenError,
  getProject,
  listApiTokens,
  listOrganizations,
  listProjects,
  revokeApiToken,
  UnauthenticatedError,
  updateOrganization,
  updateProject,
} from "@cotolk/core";
import { describe, expect, it } from "vitest";
import { openMigratedDatabase } from "./database";
import { signedInUser, tenant } from "./fixtures";

describe("organizations and projects", () => {
  it("makes the creator the owner and lists only their organizations", async () => {
    const db = await openMigratedDatabase();
    const ada = await signedInUser(db, "ada");
    const grace = await signedInUser(db, "grace");

    await createOrganization(db, ada, { slug: "acme", name: "Acme" });
    await createOrganization(db, grace, { slug: "globex", name: "Globex" });

    expect(await listOrganizations(db, ada)).toEqual([
      expect.objectContaining({ slug: "acme", role: "owner" }),
    ]);
    await expect(
      createOrganization(db, grace, { slug: "acme", name: "Again" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      createOrganization(db, ada, { slug: "Not A Slug", name: "Bad" }),
    ).rejects.toThrow();
  });

  it("creates, updates, lists, and deletes projects with canonical locales", async () => {
    const db = await openMigratedDatabase();
    const { owner } = await tenant(db, "acme");

    const created = await createProject(db, owner, "acme", {
      slug: "shop",
      name: "Shop",
      sourceLocale: "en-us",
      targetLocales: ["zh-cn", "PT-br"],
      formatConfig: { format: "i18next-json", path: "locales/{locale}.json" },
    });
    expect(created).toMatchObject({
      sourceLocale: "en-US",
      targetLocales: ["zh-CN", "pt-BR"],
      formatConfig: { format: "i18next-json", path: "locales/{locale}.json" },
    });
    await expect(
      createProject(db, owner, "acme", {
        slug: "shop",
        name: "Shop",
        sourceLocale: "en-US",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      createProject(db, owner, "acme", {
        slug: "bad",
        name: "Bad",
        sourceLocale: "not a locale",
      }),
    ).rejects.toThrow(/Invalid locale/);

    const updated = await updateProject(db, owner, "acme", "shop", {
      name: "Storefront",
      targetLocales: ["ja"],
    });
    expect(updated).toMatchObject({
      name: "Storefront",
      targetLocales: ["ja"],
      formatConfig: created.formatConfig,
    });
    expect(await listProjects(db, owner, "acme")).toEqual([updated]);

    await deleteProject(db, owner, "acme", "shop");
    expect(await listProjects(db, owner, "acme")).toEqual([]);
  });

  it("lets an API token work on projects but not administer its organization", async () => {
    const db = await openMigratedDatabase();
    const { owner, token, tokenId } = await tenant(db, "acme");

    await createProject(db, token, "acme", {
      slug: "shop",
      name: "Shop",
      sourceLocale: "en-US",
    });
    expect(await getProject(db, token, "acme", "shop")).toMatchObject({
      slug: "shop",
    });
    expect(await listOrganizations(db, token)).toEqual([
      expect.objectContaining({ slug: "acme", role: "member" }),
    ]);

    const forbidden = [
      () => deleteProject(db, token, "acme", "shop"),
      () => updateOrganization(db, token, "acme", { name: "Renamed" }),
      () => deleteOrganization(db, token, "acme"),
      () => createApiToken(db, token, "acme", { name: "Another" }),
      () => listApiTokens(db, token, "acme"),
      () => revokeApiToken(db, token, "acme", tokenId),
      () => createOrganization(db, token, { slug: "side", name: "Side" }),
    ];
    for (const action of forbidden) {
      await expect(action()).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await listApiTokens(db, owner, "acme")).toEqual([
      expect.objectContaining({ id: tokenId, revokedAt: null }),
    ]);
  });

  it("shows a token secret once and stops accepting it after revocation", async () => {
    const db = await openMigratedDatabase();
    const { owner } = await tenant(db, "acme");
    const { secret, id } = await createApiToken(db, owner, "acme", {
      name: "Deploy",
    });
    expect(secret).toMatch(/^ctk_[A-Za-z0-9_-]{43}$/);

    const listed = await listApiTokens(db, owner, "acme");
    expect(JSON.stringify(listed)).not.toContain(secret);
    const stored = await db
      .selectFrom("apiTokens")
      .select("tokenHash")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(stored.tokenHash).not.toContain(secret);

    const revoked = await revokeApiToken(db, owner, "acme", id);
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    await expect(authenticate(db, secret)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("removes projects and tokens with their organization", async () => {
    const db = await openMigratedDatabase();
    const { owner, token } = await tenant(db, "acme");
    await createProject(db, owner, "acme", {
      slug: "shop",
      name: "Shop",
      sourceLocale: "en-US",
    });

    await updateOrganization(db, owner, "acme", { name: "Acme Corp" });
    expect(await listOrganizations(db, owner)).toEqual([
      expect.objectContaining({ name: "Acme Corp" }),
    ]);
    await deleteOrganization(db, owner, "acme");

    expect(await listOrganizations(db, owner)).toEqual([]);
    expect(await db.selectFrom("projects").selectAll().execute()).toEqual([]);
    expect(await db.selectFrom("apiTokens").selectAll().execute()).toEqual([]);
    expect(token.kind).toBe("apiToken");
  });
});
