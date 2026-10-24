import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import {
  authenticate,
  createOrganization,
  createProject,
  createUser,
  type Principal,
  putKeys,
  signIn,
} from "@cotolk/core";
import { createDatabase, migrateToLatest } from "@cotolk/db";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PostgresDialect } from "kysely";
import pg from "pg";
import { ADA, GRACE, PASSWORD } from "./fixture";

const webDir = path.dirname(
  createRequire(import.meta.url).resolve("@cotolk/web/package.json"),
);

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port")),
      );
    });
  });
}

async function seed(connectionString: string) {
  const db = createDatabase(
    new PostgresDialect({ pool: new pg.Pool({ connectionString, max: 1 }) }),
  );
  try {
    await migrateToLatest(db);
    const owner = async (account: typeof ADA): Promise<Principal> => {
      await createUser(db, { ...account, password: PASSWORD });
      const { sessionToken } = await signIn(db, {
        email: account.email,
        password: PASSWORD,
      });
      return authenticate(db, sessionToken);
    };
    const ada = await owner(ADA);
    const grace = await owner(GRACE);
    await createOrganization(db, ada, { slug: "acme", name: "Acme" });
    await createOrganization(db, grace, { slug: "globex", name: "Globex" });
    await createProject(db, ada, "acme", {
      slug: "shop",
      name: "Acme Shop",
      sourceLocale: "en-US",
      targetLocales: ["es", "ru"],
    });
    await putKeys(db, ada, "acme", "shop", {
      namespace: "common",
      messages: [
        { path: ["greeting"], value: "Hello" },
        {
          path: ["cart", "items"],
          value: {
            plural: { one: "{{count}} item", other: "{{count}} items" },
          },
        },
      ],
    });
  } finally {
    await db.destroy();
  }
}

async function waitForServer(url: string, web: ChildProcess) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (web.exitCode !== null) {
      throw new Error(`Web server exited with ${web.exitCode}`);
    }
    try {
      const response = await fetch(new URL("/login", url));
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Web server at ${url} did not become ready`);
}

export default async function globalSetup() {
  const database = await PGlite.create();
  const dbPort = await freePort();
  const socket = new PGLiteSocketServer({
    db: database,
    host: "127.0.0.1",
    port: dbPort,
    maxConnections: 8,
  });
  await socket.start();
  const connectionString = `postgres://postgres@127.0.0.1:${dbPort}/postgres?sslmode=disable`;
  await seed(connectionString);

  const webPort = await freePort();
  const url = `http://127.0.0.1:${webPort}`;
  const web = spawn(
    process.execPath,
    ["--import", "tsx", path.join("server", "main.ts")],
    {
      cwd: webDir,
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
        PORT: String(webPort),
        HOST: "127.0.0.1",
        COTOLK_PUBLIC_URL: url,
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  await waitForServer(url, web);
  process.env.COTOLK_E2E_URL = url;
  process.env.COTOLK_E2E_DATABASE_URL = connectionString;

  return async () => {
    if (web.exitCode === null) {
      const exited = new Promise((resolve) => web.once("exit", resolve));
      web.kill();
      await exited;
    }
    await socket.stop();
    await database.close();
  };
}
