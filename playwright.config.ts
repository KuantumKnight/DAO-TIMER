import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: "http://localhost:3000", colorScheme: "dark", trace: "retain-on-failure" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
  reporter: "list"
});
