import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { baseURL: process.env.COTOLK_E2E_URL, trace: "retain-on-failure" },
  reporter: [["list"]],
});
