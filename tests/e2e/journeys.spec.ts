import { test, expect, type Page } from "@playwright/test";

/**
 * Buyer/explorer JOURNEY specs (P1-9): the three flows the product is sold on.
 *
 * 1. Pin-drop via shared URL -> the Location Check report renders its sections.
 * 2. Share-URL restore -> weights + lens come back exactly as serialized.
 * 3. Compare -> two areas side by side with scores + deep rows.
 *
 * Static-export compatible: everything here is client-side URL state over baked
 * JSON. Runs against the dev server locally (default mode) and against the
 * prebuilt artifact in CI (STATIC_E2E=1), where URLs need the Pages sub-path
 * prefix because baseURL ends in the sub-path without a trailing slash.
 */
const BASE = ""; // root path since the festra.au cutover (2026-06-12)

// The buyer panel renders twice (desktop sidebar + mobile sheet); one copy is
// display:none per viewport, so every assertion filters to the visible copy.
const visible = (page: Page, role: Parameters<Page["getByRole"]>[0], name: string | RegExp) =>
  page.getByRole(role, { name }).filter({ visible: true }).first();

test.describe("journey: pin-drop report via URL", () => {
  test("?buyer=1&lat&lng renders the report sections at the pin", async ({ page }) => {
    // CBD pin - always in coverage, always yields findings + amenities.
    await page.goto(`${BASE}/?buyer=1&lat=-37.8136&lng=144.9631`);

    await expect(visible(page, "heading", "Buyer Location Check")).toBeVisible({
      timeout: 25_000,
    });
    // Report sections (live variant): summary, sun path, nearby amenities.
    await expect(visible(page, "heading", "Executive summary")).toBeVisible({
      timeout: 25_000,
    });
    await expect(visible(page, "heading", "Sun & light")).toBeVisible();
    await expect(visible(page, "heading", "Nearby amenities")).toBeVisible();
    // Glimpse rule: the live panel shows NO dataset-vintage stamps on screen -
    // "as at <date>" provenance lives in the full pin report it links to.
    await expect(page.getByText(/as at \d{4}/).filter({ visible: true })).toHaveCount(0);
    // The pin's coordinates are echoed in the header (toFixed(5)).
    await expect(
      page.getByText("-37.81360, 144.96310").filter({ visible: true }).first()
    ).toBeVisible();
    // The dated-artifact promise: print/save-as-PDF is one tap away.
    await expect(visible(page, "button", /Print \/ save as PDF/)).toBeVisible();
    // Both artifacts are reachable from the live panel: the PIN report (the
    // only link with "report" in it) and the AREA profile.
    await expect(visible(page, "link", /Full report for this pin/)).toBeVisible();
    await expect(visible(page, "link", /Explore the area profile/)).toBeVisible();
  });
});

test.describe("journey: share-URL state restore", () => {
  test("?w= weights and ?view= lens are restored into the controls", async ({
    page,
    isMobile,
  }) => {
    // First visits to the plain map show the onboarding lens-picker modal,
    // whose own "Family" card would shadow the lens pill (and its overlay
    // intercepts mobile tab clicks). Seed the seen-flag like a returning user.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("mlv-onboarded-v1", "1");
      } catch {
        /* ignore */
      }
    });
    // Non-default weights (transport cranked, rent burden floored) + Family lens.
    // Explicit ?w= must win over the lens's own preset weights.
    await page.goto(
      `${BASE}/?w=affordability:5,transport:60,safety:14,health:14,hazards:8,education:8,income:8&view=family`
    );

    if (isMobile) {
      await page.getByRole("tab", { name: "Weights" }).click();
    }
    // Lens pill restored from ?view=
    await expect(visible(page, "button", "Family")).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: 15_000 }
    );
    // Sliders are collapsed behind "Fine-tune priorities" - open and verify the
    // raw weights survived the round-trip.
    await page.getByText("Fine-tune priorities").filter({ visible: true }).first().click();
    await expect(
      page.getByRole("slider", { name: "Transport weight" }).filter({ visible: true }).first()
    ).toHaveValue("60");
    await expect(
      page.getByRole("slider", { name: "Rent burden weight" }).filter({ visible: true }).first()
    ).toHaveValue("5");
  });
});

test.describe("journey: compare two areas", () => {
  test("?list= shows both areas with scores and deep indicator rows", async ({ page }) => {
    await page.goto(`${BASE}/compare?list=toorak-206061138,brunswick-east-206011106`);

    await expect(page.getByRole("heading", { name: /Compare places/ })).toBeVisible();
    // Both areas resolve to profile links in the table header.
    await expect(page.getByRole("link", { name: "Toorak" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: "Brunswick East" })).toBeVisible();
    // Scored composite + a domain sub-indicator row both populate.
    await expect(page.getByText("Overall score").first()).toBeVisible();
    await expect(page.getByText("Rent-to-income").first()).toBeVisible();
  });
});
