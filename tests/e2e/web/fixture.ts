import { createRequire } from "node:module";
import path from "node:path";

export const ADA = { email: "ada@example.invalid", name: "Ada" };
export const GRACE = { email: "grace@example.invalid", name: "Grace" };
export const PASSWORD = "correct horse battery staple";

export const webDir = path.dirname(
  createRequire(import.meta.url).resolve("@cotolk/web/package.json"),
);
