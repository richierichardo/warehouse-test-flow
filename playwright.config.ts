import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: "npm run start -- --port 3100",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
