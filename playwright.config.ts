import { defineConfig, devices } from "@playwright/test";

// Local runs read the repository-root .env (CI sets real environment variables).
try {
  process.loadEnvFile(new URL("./.env", import.meta.url));
} catch {
  // No .env file.
}

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  // Every run starts from an empty install in the test database (see e2e/global-setup.ts).
  globalSetup: "./e2e/global-setup.ts",
  // Specs share one database, so they run one file at a time.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Optional: use a preinstalled Chromium instead of `playwright install`.
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Phone width checks layout only; the stateful auth flow runs once, on desktop.
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /health\.spec\.ts/ },
  ],
  // Start the production build unless E2E_BASE_URL points at an already-running instance.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @petey/web start",
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
