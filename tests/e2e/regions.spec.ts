import { existsSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import REGIONS, {
  DEFAULT_REGION,
  REGION_IDS,
  regionDataFile,
  type RegionId,
} from "../../lib/regions";

/**
 * Per-region SMOKE spec (Wave 2 item 6): for every region whose places
 * artifact is baked into public/data, prove that ?region={r}
 *   1. resolves to that region (data-region marker, no melbourne fallback),
 *   2. paints the map canvas (choropleth host),
 *   3. shows the region in the capital switcher (desktop top bar), and
 *   4. opens a place panel (?buyer=1 opens the Location check panel - the
 *      honest melbourne-only note outside melbourne IS the panel today).
 * Deliberately shallow - the full journeys stay melbourne-only in
 * journeys.spec.ts. Static-export compatible (client-side URL state over the
 * baked region JSON), so it runs in dev mode, against the prebuilt artifact
 * (STATIC_E2E=1) and against production via E2E_BASE_URL.
 */
const BASE = process.env.STATIC_E2E ? "/melbourne-liveability" : "";

// Playwright runs from the repo root; the artifact list in the checkout
// decides which regions are live (same files CI just built/deployed).
const DATA_DIR = path.join(process.cwd(), "public", "data");
const LIVE_REGIONS: RegionId[] = REGION_IDS.filter((r) =>
  existsSync(path.join(DATA_DIR, regionDataFile(r, "places.json")))
);

test.describe("per-region smoke", () => {
  test.beforeEach(async ({ page }) => {
    // Returning-user seed: the landing/onboarding gates have their own specs.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("mlv-onboarded-v1", "1");
      } catch {
        /* ignore */
      }
    });
  });

  for (const region of LIVE_REGIONS) {
    const label = REGIONS[region].label;

    test(`${region}: loads its data, paints the map, opens the panel`, async ({
      page,
      isMobile,
    }) => {
      await page.goto(`${BASE}/?region=${region}&buyer=1`);

      // Region seam markers: the requested region actually mounted...
      if (region === DEFAULT_REGION) {
        // melbourne omits the marker by design (prerendered DOM identical).
        await expect(page.locator("main[data-region]")).toHaveCount(0);
      } else {
        await expect(page.locator(`main[data-region="${region}"]`)).toBeAttached({
          timeout: 25_000,
        });
      }
      // ...and did NOT silently fall back to melbourne data.
      await expect(page.locator("main[data-region-fallback]")).toHaveCount(0);

      // Choropleth host: MapLibre canvas paints.
      await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
        timeout: 25_000,
      });

      // Capital switcher reflects the region (top bar is desktop-only; the
      // mobile sheet hosts its own copy behind the Search tab - skip there).
      if (!isMobile) {
        await expect(
          page.getByRole("button", {
            name: `Switch capital city - current: ${label}`,
          })
        ).toBeVisible();
      }

      // Place panel: ?buyer=1 opens the Location check panel. On mobile the
      // panel lives in the (initially collapsed) bottom sheet - the visible
      // proof of buyer mode there is the pressed "Exit location check" toggle.
      if (isMobile) {
        await expect(
          page
            .getByRole("button", { name: /Exit location check/i })
            .filter({ visible: true })
            .first()
        ).toBeVisible({ timeout: 20_000 });
      } else {
        await expect(
          page
            .getByRole("heading", { name: "Location check" })
            .filter({ visible: true })
            .first()
        ).toBeVisible({ timeout: 20_000 });
        // Outside melbourne the panel shows the honest "Melbourne-only"
        // pin-report note - that gate text is the contract, not a failure.
        if (region !== DEFAULT_REGION) {
          await expect(
            page
              .getByText(/Full pin reports are Melbourne-only today/)
              .filter({ visible: true })
              .first()
          ).toBeVisible();
        }
      }
    });
  }
});
