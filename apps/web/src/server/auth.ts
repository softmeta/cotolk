import { authenticate, UnauthenticatedError } from "@cotolk/core";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { withCoreErrors } from "./core-errors";
import { serverDatabase } from "./database";
import { readSessionToken } from "./session";

function bearerToken() {
  const header = getRequest().headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function expectedOrigin(request: Request) {
  return new URL(process.env.COTOLK_PUBLIC_URL ?? request.url).origin;
}

export const sameOriginMiddleware = createMiddleware().server(
  ({ next, request }) => {
    const origin = request.headers.get("origin");
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (unsafe && origin && origin !== expectedOrigin(request)) {
      throw new Response("Cross-origin request refused", { status: 403 });
    }
    return next();
  },
);

export const principalMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const db = serverDatabase();
  const secret = bearerToken() ?? readSessionToken();
  const principal = await withCoreErrors(() => {
    if (!secret) {
      throw new UnauthenticatedError();
    }
    return authenticate(db, secret);
  });
  return next({ context: { db, principal } });
});
