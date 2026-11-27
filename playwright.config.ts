import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";
import { testDatabaseUrl } from "./tests/integration/database";

const baseURL = "http://127.0.0.1:3100";
const rateSecret = process.env.WAREHOUSE_E2E_RATE_SECRET ?? randomBytes(32).toString("hex");
process.env.WAREHOUSE_E2E_RATE_SECRET = rateSecret;

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 75_000,
  expect: { timeout: 20_000 },
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: `${baseURL}/api/auth/get-session`,
    env: {
      DATABASE_URL: testDatabaseUrl(),
      BETTER_AUTH_URL: baseURL,
      APP_ORIGIN: baseURL,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      RATE_LIMIT_KEY_SECRET: rateSecret,
      TRUSTED_PROXY_MODE: "direct",
    },
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
