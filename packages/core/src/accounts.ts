import type { Database } from "@cotolk/db";
import type { Kysely } from "kysely";
import { z } from "zod";
import {
  ConflictError,
  isUniqueViolation,
  TooManyAttemptsError,
  UnauthenticatedError,
} from "./errors";
import { emailSchema, nameSchema, passwordSchema } from "./inputs";
import type { LoginThrottle } from "./login-throttle";
import {
  generateSecret,
  hashPassword,
  hashSecret,
  passwordDecoy,
  verifyPassword,
} from "./secrets";

const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

const createUserInput = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
});

const signInInput = z.object({ email: emailSchema, password: z.string() });

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export async function createUser(
  db: Kysely<Database>,
  input: z.input<typeof createUserInput>,
): Promise<User> {
  const { email, name, password } = createUserInput.parse(input);
  try {
    return await db
      .insertInto("users")
      .values({ email, name, passwordHash: await hashPassword(password) })
      .returning(["id", "email", "name", "createdAt"])
      .executeTakeFirstOrThrow();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`A user with email ${email} already exists`);
    }
    throw error;
  }
}

export interface SignInOptions {
  throttle?: LoginThrottle;
  now?: Date;
}

export async function signIn(
  db: Kysely<Database>,
  input: z.input<typeof signInInput>,
  { throttle, now = new Date() }: SignInOptions = {},
) {
  const { email, password } = signInInput.parse(input);
  const retryAfterMs = throttle?.retryAfterMs(email, now) ?? 0;
  if (retryAfterMs > 0) {
    throw new TooManyAttemptsError(retryAfterMs);
  }
  const user = await db
    .selectFrom("users")
    .select(["id", "passwordHash"])
    .where("email", "=", email)
    .executeTakeFirst();
  const verified = await verifyPassword(
    password,
    user?.passwordHash ?? (await passwordDecoy()),
  );
  if (!user?.passwordHash || !verified) {
    throttle?.recordFailure(email, now);
    throw new UnauthenticatedError("Invalid email or password");
  }
  throttle?.reset(email);
  const { secret, hash } = generateSecret("session");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db
    .insertInto("userSessions")
    .values({ userId: user.id, tokenHash: hash, expiresAt })
    .execute();
  return { sessionToken: secret, expiresAt };
}

export async function signOut(db: Kysely<Database>, sessionToken: string) {
  await db
    .deleteFrom("userSessions")
    .where("tokenHash", "=", hashSecret(sessionToken))
    .execute();
}
