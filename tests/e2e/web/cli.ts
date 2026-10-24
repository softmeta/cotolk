import { spawn } from "node:child_process";
import path from "node:path";
import { webDir } from "./fixture";

export function runCotolk(args: string[], stdin = "") {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", path.join("server", "cli.ts"), ...args],
    {
      cwd: webDir,
      env: {
        ...process.env,
        DATABASE_URL: process.env.COTOLK_E2E_DATABASE_URL,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(stdin);
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, stdout, stderr }));
    },
  );
}
