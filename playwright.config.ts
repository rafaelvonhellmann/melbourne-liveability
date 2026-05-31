import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests for the liveability site. Runs against the dev server (or an
 * already-running one). Unit tests stay on vitest (*.test.ts); Playwright owns
 * *.spec.ts under tests/e2e so the two never collide.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Dev mode compiles routes on first hit; give assertions headroom.
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
