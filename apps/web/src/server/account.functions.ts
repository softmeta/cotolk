import { createLoginThrottle, signIn, signOut } from "@cotolk/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withCoreErrors } from "./core-errors";
import { serverDatabase } from "./database";
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from "./session";

const throttle = createLoginThrottle();

export const logIn = createServerFn({ method: "POST" })
  .validator(z.object({ email: z.string(), password: z.string() }))
  .handler(({ data }) =>
    withCoreErrors(async () => {
      const { sessionToken, expiresAt } = await signIn(serverDatabase(), data, {
        throttle,
      });
      setSessionCookie(sessionToken, expiresAt);
      return { ok: true };
    }),
  );

export const logOut = createServerFn({ method: "POST" }).handler(async () => {
  const token = readSessionToken();
  if (token) {
    await signOut(serverDatabase(), token);
  }
  clearSessionCookie();
  return { ok: true };
});
