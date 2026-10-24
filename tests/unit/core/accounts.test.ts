import {
  authenticate,
  ConflictError,
  createLoginThrottle,
  createUser,
  signIn,
  signOut,
  TooManyAttemptsError,
  UnauthenticatedError,
} from "@cotolk/core";
import { describe, expect, it } from "vitest";
import { openMigratedDatabase, PASSWORD } from "./database";

describe("accounts", () => {
  it("signs a user in with a normalized email and authenticates the session", async () => {
    const db = await openMigratedDatabase();
    const user = await createUser(db, {
      email: " Ada@Example.Invalid ",
      name: "Ada",
      password: PASSWORD,
    });
    expect(user.email).toBe("ada@example.invalid");

    const { sessionToken } = await signIn(db, {
      email: "ADA@example.invalid",
      password: PASSWORD,
    });

    expect(await authenticate(db, sessionToken)).toEqual({
      kind: "user",
      userId: user.id,
    });
    const stored = await db
      .selectFrom("users")
      .select("passwordHash")
      .executeTakeFirstOrThrow();
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toContain(PASSWORD);
  });

  it("rejects a wrong password and an unknown email the same way", async () => {
    const db = await openMigratedDatabase();
    await createUser(db, {
      email: "ada@example.invalid",
      name: "Ada",
      password: PASSWORD,
    });

    await expect(
      signIn(db, { email: "ada@example.invalid", password: "wrong password!" }),
    ).rejects.toThrow(new UnauthenticatedError("Invalid email or password"));
    await expect(
      signIn(db, { email: "nobody@example.invalid", password: PASSWORD }),
    ).rejects.toThrow(new UnauthenticatedError("Invalid email or password"));
    expect(await db.selectFrom("userSessions").selectAll().execute()).toEqual(
      [],
    );
  });

  it("refuses a duplicate email and a short password", async () => {
    const db = await openMigratedDatabase();
    const input = {
      email: "ada@example.invalid",
      name: "Ada",
      password: PASSWORD,
    };
    await createUser(db, input);

    await expect(
      createUser(db, { ...input, email: "ADA@example.invalid" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      createUser(db, {
        ...input,
        email: "grace@example.invalid",
        password: "short",
      }),
    ).rejects.toThrow();
  });

  it("ends sessions on sign-out and on expiry", async () => {
    const db = await openMigratedDatabase();
    await createUser(db, {
      email: "ada@example.invalid",
      name: "Ada",
      password: PASSWORD,
    });
    const credentials = { email: "ada@example.invalid", password: PASSWORD };
    const signedOut = await signIn(db, credentials);
    const expiring = await signIn(db, credentials);

    await signOut(db, signedOut.sessionToken);

    await expect(
      authenticate(db, signedOut.sessionToken),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(
      authenticate(db, expiring.sessionToken, expiring.expiresAt),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("rejects malformed and unknown credentials", async () => {
    const db = await openMigratedDatabase();

    for (const secret of ["", "Bearer x", "ctk_unknown", "cts_unknown"]) {
      await expect(authenticate(db, secret)).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    }
  });

  it("throttles repeated failures per email until the window passes", async () => {
    const db = await openMigratedDatabase();
    await createUser(db, {
      email: "ada@example.invalid",
      name: "Ada",
      password: PASSWORD,
    });
    const throttle = createLoginThrottle({ maxFailures: 2, windowMs: 60_000 });
    const start = new Date("2026-10-24T00:00:00Z");
    const attempt = (password: string, now: Date) =>
      signIn(db, { email: "ada@example.invalid", password }, { throttle, now });

    await expect(attempt("wrong password 1", start)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    await expect(attempt("wrong password 2", start)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    const blocked = attempt(PASSWORD, start);
    await expect(blocked).rejects.toBeInstanceOf(TooManyAttemptsError);
    await expect(blocked).rejects.toMatchObject({ retryAfterMs: 60_000 });

    const later = new Date(start.getTime() + 60_001);
    await expect(attempt(PASSWORD, later)).resolves.toMatchObject({
      sessionToken: expect.stringMatching(/^cts_/),
    });
  });
});
