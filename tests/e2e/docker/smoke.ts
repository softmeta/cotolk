import { strict as assert } from "node:assert";
import { type SpawnSyncOptions, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");

async function freePort() {
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

const port = await freePort();
const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: `cotolk-smoke-${process.pid}`,
  POSTGRES_PASSWORD: "smoke-test-password",
  COTOLK_PORT: String(port),
  COTOLK_PUBLIC_URL: `http://localhost:${port}`,
};

function compose(args: string[], options: SpawnSyncOptions = {}) {
  const result = spawnSync("docker", ["compose", ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
    ...options,
  });
  if (result.error) throw result.error;
  return { code: result.status, stdout: String(result.stdout ?? "") };
}

function createUser(email: string, password: string) {
  return compose(
    [
      "exec",
      "-T",
      "web",
      "cotolk",
      "admin",
      "create-user",
      "--email",
      email,
      "--name",
      "Admin",
    ],
    { input: `${password}\n` },
  );
}

async function waitForLogin() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${port}/login`);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The web role did not serve /login");
}

try {
  assert.equal(compose(["up", "-d", "--build", "--wait"]).code, 0);
  assert.match(await (await waitForLogin()).text(), /Sign in/);

  const created = createUser(
    "admin@example.invalid",
    "a long smoke test password",
  );
  assert.equal(created.code, 0);
  assert.equal(JSON.parse(created.stdout).email, "admin@example.invalid");
  assert.equal(
    createUser("admin@example.invalid", "another long password").code,
    1,
  );

  assert.equal(compose(["restart", "web"]).code, 0);
  await waitForLogin();
  assert.equal(compose(["run", "--rm", "web", "migrate"]).code, 0);
  process.stdout.write("Docker smoke passed\n");
} finally {
  compose(["down", "-v"]);
}
