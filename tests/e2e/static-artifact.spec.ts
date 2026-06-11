import { test, expect } from "@playwright/test";

/**
 * Smoke tests against the BUILT static export (out/) served under the GitHub
 * Pages sub-path, exactly as deploy-pages.yml publishes it. Catches basePath
 * regressions (asset URLs, data fetches, internal links) before deploy.
 *
 * Runs only with STATIC_E2E=1 (see playwright.config.ts); CI serves the
 * artifact itself: mkdir _site && cp -r out _site/melbourne-liveability &&
 * npx serve _site -l 4173.
 */
const BASE = "/melbourne-liveability";

test("app shell renders under the base path", async ({ page, isMobile }) => {
  // This asserts the MAP shell (search box / sheet tabs) under the base path;
  // fresh visitors get the landing instead, so seed the seen-flag like the
  // other map-focused suites. The landing has its own smoke coverage.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("mlv-onboarded-v1", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("link", { name: /festra|liveable/i }).first()).toBeVisible();
  if (isMobile) {
    // Below the sm breakpoint the header SearchBox is hidden; search lives
    // behind the bottom sheet's Search tab, so assert the tab instead.
    await expect(page.getByRole("tab", { name: "Search" })).toBeVisible();
  } else {
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
  }
});

test("places.json is fetchable under the base path", async ({ request }) => {
  const res = await request.get(`${BASE}/data/places.json`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { places?: unknown[] };
  expect(Array.isArray(body.places)).toBe(true);
  expect(body.places!.length).toBeGreaterThan(0);
});

test("methodology page renders under the base path", async ({ page }) => {
  // No trailing slash: mirrors the extensionless URLs Next emits and GitHub
  // Pages serves (out/ has methodology.html, not methodology/index.html).
  await page.goto(`${BASE}/methodology`);
  await expect(
    page.getByRole("heading", { name: /Full source manifest/ })
  ).toBeVisible();
});
