import path from "node:path";
import { pathToFileURL } from "node:url";
import { migrateToLatest } from "@cotolk/db";
import { serve } from "srvx";
import { staticMiddleware } from "srvx/static";
import { withDatabase } from "./connection";

const distDir = path.join(import.meta.dirname, "..", "dist");

export async function serveWeb() {
  await withDatabase(migrateToLatest);
  const { default: app } = await import(
    pathToFileURL(path.join(distDir, "server", "server.js")).href
  );
  const server = serve({
    port: Number(process.env.PORT ?? 3000),
    hostname: process.env.HOST ?? "0.0.0.0",
    middleware: [
      staticMiddleware({
        dir: path.join(distDir, "client"),
        maxAge: 31_536_000,
        immutable: true,
      }),
    ],
    fetch: app.fetch,
  });
  await server.ready();
}
