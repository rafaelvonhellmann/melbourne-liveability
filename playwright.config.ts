import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests for the liveability site. Runs against the dev server (or an
 * already-running one). Unit tests stay on vitest (*.test.ts); Playwright owns
 * *.spec.ts under tests/e2e so the two never collide.
 *
 * STATIC_E2E=1 flips to static-artifact mode (used by deploy-pages.yml):
 * static-artifact.spec.ts plus the static-compatible journey specs run against
 * a prebuilt out/ served under the GitHub Pages sub-path. CI starts that
 * server itself, so no webServer here.
 */
const staticMode = !!process.env.STATIC_E2E;

export default defineConfig({
  testDir: "./tests/e2e",
  ...(staticMode
    ? { testMatch: [/static-artifact\.spec\.ts/, /journeys\.spec\.ts/] }
    : { testIgnore: /static-artifact\.spec\.ts/ }),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Dev mode compiles routes on first hit; give assertions headroom.
  expect: { timeout: 10_000 },
  use: {
    // E2E_BASE_URL lets the same static suite run against PRODUCTION
    // (e.g. E2E_BASE_URL=https://.../melbourne-liveability STATIC_E2E=1).
    baseURL:
      process.env.E2E_BASE_URL ??
      (staticMode
        ? "http://localhost:4173/melbourne-liveability"
        : "http://localhost:3000"),
    trace: "on-first-retry",
  },
  // Both modes run desktop + mobile: CI only ever runs STATIC_E2E=1, so the
  // mobile project must exist in static mode too or it never runs in CI.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  ...(staticMode
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          port: 3000,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
