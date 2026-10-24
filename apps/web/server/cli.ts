import { text } from "node:stream/consumers";
import { parseArgs } from "node:util";
import { ConflictError, createUser } from "@cotolk/core";
import { migrateToLatest } from "@cotolk/db";
import { ZodError } from "zod";
import { withDatabase } from "./connection";
import { serveWeb } from "./web";

const USAGE = `Usage: cotolk-server <command>

Commands:
  web                                         Migrate the database and serve the web app
  migrate                                     Migrate the database to the latest schema
  admin create-user --email <e> --name <n>    Create a user; the password is read from stdin`;

async function createUserFromStdin(args: string[]) {
  const { values } = parseArgs({
    args,
    options: { email: { type: "string" }, name: { type: "string" } },
  });
  const { email, name } = values;
  if (!email || !name) {
    throw new UsageError();
  }
  const password = (await text(process.stdin)).replace(/\r?\n$/, "");
  const user = await withDatabase((db) =>
    createUser(db, { email, name, password }),
  );
  process.stdout.write(
    `${JSON.stringify({ id: user.id, email: user.email })}\n`,
  );
}

class UsageError extends Error {}

async function run([command, ...args]: string[]) {
  if (command === "web") return serveWeb();
  if (command === "migrate") return withDatabase(migrateToLatest);
  if (command === "admin" && args[0] === "create-user") {
    return createUserFromStdin(args.slice(1));
  }
  throw new UsageError();
}

function failureMessage(error: unknown) {
  if (error instanceof UsageError) return USAGE;
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
  }
  if (error instanceof ConflictError) return error.message;
  return undefined;
}

try {
  await run(process.argv.slice(2));
} catch (error) {
  const message = failureMessage(error);
  if (message === undefined) throw error;
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
