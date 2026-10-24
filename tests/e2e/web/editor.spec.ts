import { expect, type Page, type Request, test } from "@playwright/test";
import pg from "pg";
import { ADA, GRACE, PASSWORD } from "./fixture";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

async function query<Row extends object>(text: string, values: unknown[]) {
  const client = new pg.Client(process.env.COTOLK_E2E_DATABASE_URL);
  await client.connect();
  try {
    return (await client.query<Row>(text, values)).rows;
  } finally {
    await client.end();
  }
}

async function translationFor(path: string, locale: string) {
  const [row] = await query<{ forms: unknown; status: string }>(
    `SELECT t.forms, t.status FROM translations t
     JOIN keys k ON k.id = t.key_id
     WHERE array_to_string(k.path, '.') = $1 AND t.locale = $2`,
    [path, locale],
  );
  return row;
}

async function revisionsFor(path: string, locale: string) {
  return query<{ kind: string; status: string }>(
    `SELECT r.kind, r.status FROM translation_revisions r
     JOIN translations t ON t.id = r.translation_id
     JOIN keys k ON k.id = t.key_id
     WHERE array_to_string(k.path, '.') = $1 AND t.locale = $2
     ORDER BY r.revision`,
    [path, locale],
  );
}

test("an anonymous visitor is sent to sign in without seeing project data", async ({
  page,
}) => {
  await page.goto("/acme/shop/editor");

  await expect(page).toHaveURL(/\/login$/);
  const html = await page.content();
  expect(html).not.toContain("Acme Shop");
  expect(html).not.toContain("greeting");
});

test("the editor loads real keys, filters by validated search, and saves a translation", async ({
  page,
}) => {
  await signIn(page, ADA.email);
  await page.getByRole("link", { name: "Acme Shop" }).click();
  await expect(page.getByRole("heading", { name: "Acme Shop" })).toBeVisible();
  await expect(page.getByText("en-US → es")).toBeVisible();
  const keys = page.getByRole("list", { name: "Keys" });
  await expect(keys.getByRole("form")).toHaveCount(2);

  await page.goto("/acme/shop/editor?locale=ru&status=bogus");
  const ruItems = page.getByRole("form", { name: "cart.items" });
  await expect(ruItems.getByRole("textbox")).toHaveCount(4);

  await page.goto("/acme/shop/editor?locale=es");
  const greeting = page.getByRole("form", { name: "greeting" });
  await greeting.getByRole("textbox").fill("Hola");
  await greeting.getByRole("button", { name: "Save", exact: true }).click();
  await expect(greeting.getByText("needs_review")).toBeVisible();
  await greeting.getByRole("button", { name: "Save and approve" }).click();
  await expect(
    page.getByRole("form", { name: "greeting" }).getByText("approved"),
  ).toBeVisible();

  await page.goto("/acme/shop/editor?locale=es&status=approved");
  await expect(keys.getByRole("form")).toHaveCount(1);
  await expect(
    page.getByRole("form", { name: "greeting" }).getByRole("textbox"),
  ).toHaveValue("Hola");
  expect(await revisionsFor("greeting", "es")).toEqual([
    { kind: "submit", status: "needs_review" },
    { kind: "submit", status: "approved" },
  ]);
});

test("a member of another organization finds nothing", async ({ page }) => {
  await signIn(page, GRACE.email);
  await expect(page.getByRole("link", { name: "Acme Shop" })).toHaveCount(0);

  await page.goto("/acme/shop/editor");

  await expect(page.getByRole("alert")).toHaveText("Not found.");
  expect(await page.content()).not.toContain("Acme Shop");
});

test("server functions refuse anonymous and cross-origin calls", async ({
  page,
  playwright,
}) => {
  await signIn(page, ADA.email);
  await page.goto("/acme/shop/editor?locale=es");
  let captured: Request | undefined;
  await page.route("**/_serverFn/**", async (route) => {
    if (route.request().method() !== "POST" || captured) {
      return route.continue();
    }
    captured = route.request();
    return route.abort();
  });
  const greeting = page.getByRole("form", { name: "greeting" });
  await greeting.getByRole("textbox").fill("Buenas");
  await greeting.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => captured).toBeDefined();
  const request = captured as Request;
  const body = request.postData() ?? "";
  const { cookie, ...headers } = await request.allHeaders();
  expect(cookie).toContain("cotolk_session");
  const before = await translationFor("greeting", "es");

  const anonymous = await playwright.request.newContext();
  await anonymous.post(request.url(), { data: body, headers, maxRedirects: 0 });
  await anonymous.dispose();
  expect(await translationFor("greeting", "es")).toEqual(before);

  const crossOrigin = await page.request.post(request.url(), {
    data: body,
    headers: { ...headers, origin: "https://evil.example.invalid" },
  });
  expect(crossOrigin.status()).toBe(403);
  expect(await translationFor("greeting", "es")).toEqual(before);

  const genuine = await page.request.post(request.url(), {
    data: body,
    headers,
  });
  expect(genuine.ok()).toBe(true);
  expect(await translationFor("greeting", "es")).toEqual({
    forms: { other: "Buenas" },
    status: "needs_review",
  });
});
