import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { defineConfig } from "@playwright/test";

// @next/env is CommonJS; under "type": "module" its named exports aren't
// statically analyzable, so go through the default export.
const { loadEnvConfig } = nextEnv;

// The e2e suite runs against a real Clerk dev instance, so it needs the same
// apps/web/.env the dev server reads (Clerk keys). @next/env is Next's own
// loader - no extra dotenv dependency.
const dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvConfig(dirname);

// Local-only suite: it needs postgres+redis running and Clerk dev keys in
// apps/web/.env, so it is deliberately NOT part of the CI workflow.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global.setup.ts",
  // Auth state is per-test; parallel workers would race Clerk's bot-detection
  // tokens on the same origin for no meaningful speedup at this suite size.
  workers: 1,
  // Dev-mode Next compiles routes on first hit, which easily exceeds the
  // 5s default expect timeout.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      AUTH_MODE: "clerk",
      DATABASE_URL: "postgres://vrt:vrt@localhost:5432/vrt",
      REDIS_URL: "redis://localhost:6379",
      STORAGE_LOCAL_PATH: path.join(dirname, "..", "..", ".data", "shots"),
    },
  },
});
