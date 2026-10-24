import { expect, test } from "@playwright/test";
import { runCotolk } from "./cli";

const LIN = { email: "lin@example.invalid", name: "Lin" };
const LIN_PASSWORD = "a long enough admin password";

test("an administrator creates the first account from the command line", async ({
  page,
}) => {
  const created = await runCotolk(
    ["admin", "create-user", "--email", LIN.email, "--name", LIN.name],
    `${LIN_PASSWORD}\r\n`,
  );
  expect(created.code).toBe(0);
  expect(JSON.parse(created.stdout)).toMatchObject({ email: LIN.email });

  const duplicate = await runCotolk(
    ["admin", "create-user", "--email", LIN.email, "--name", LIN.name],
    LIN_PASSWORD,
  );
  expect(duplicate.code).toBe(1);
  expect(duplicate.stderr).toContain(LIN.email);

  const weak = await runCotolk(
    ["admin", "create-user", "--email", "weak@example.invalid", "--name", "W"],
    "short",
  );
  expect(weak.code).toBe(1);
  expect(weak.stderr).toContain("password");

  await page.goto("/login");
  await page.getByLabel("Email").fill(LIN.email);
  await page.getByLabel("Password").fill(LIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});

test("an unknown command prints usage and fails", async () => {
  const result = await runCotolk(["serve"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("Usage: cotolk");
});
