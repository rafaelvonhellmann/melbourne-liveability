import { test, expect, type Page } from "@playwright/test";

// A residential SA2 known to have a rich profile (population trend + crime).
const PROFILE = "/places/brunswick-east-206011106";

test.describe("content routes", () => {
  test("pricing page says it's free", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: /It's free/i, level: 1 })).toBeVisible();
    await expect(page.getByText(/free to use/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Open the map/ })).toBeVisible();
  });

  test("account page renders with export + clear", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Export my data/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Clear this device/ })).toBeVisible();
  });

  test("signin page renders the magic-link form", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send sign-in link" })).toBeVisible();
  });

  test("auth page scrubs junk token and renders invalid state", async ({ page }) => {
    await page.route("**/api/auth/verify", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_or_expired" }),
      })
    );
    await page.goto("/auth#token=junk");
    await expect(
      page.getByRole("heading", { name: "This sign-in link did not work" })
    ).toBeVisible();
    expect(page.url()).not.toContain("token");
  });

  test("privacy + terms are marked draft", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/Draft - not yet legal advice/)).toBeVisible();
    await page.goto("/terms");
    await expect(page.getByText(/Draft - not yet legal advice/)).toBeVisible();
  });

  test("methodology renders the source manifest", async ({ page }) => {
    await page.goto("/methodology");
    await expect(
      page.getByRole("heading", { name: /Full source manifest/ })
    ).toBeVisible();
    await expect(page.getByRole("table").first()).toBeVisible();
  });

  test("compare page loads", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByRole("heading", { name: /Compare places/ })).toBeVisible();
  });

  test("compare deep table populates from ?list= with sub-indicators + tenure", async ({
    page,
  }) => {
    await page.goto(
      "/compare?list=toorak-206061138,brunswick-east-206011106"
    );
    await expect(page.getByRole("link", { name: "Toorak" })).toBeVisible({ timeout: 15_000 });
    // Deep rows: a domain sub-indicator + the tenure context row.
    await expect(page.getByText("Rent-to-income").first()).toBeVisible();
    await expect(page.getByText(/Owner-occupied % \(approx\)/)).toBeVisible();
  });
});

test.describe("profile", () => {
  test("loads, switches to the Safety tab, shows the council-level crime note", async ({ page }) => {
    await page.goto(PROFILE);
    await expect(page.getByRole("heading", { name: "Brunswick East", level: 1 })).toBeVisible();
    // population trend (Overview)
    await expect(page.getByText(/Population trend/i)).toBeVisible();
    // tab switch — the crime sparklines carry a council-level geography note
    // (crime is recorded at council level, not SA2), so take the first.
    await page.getByRole("tab", { name: /Crime|Safety/ }).click();
    await expect(page.getByText(/Council-level/i).first()).toBeVisible();
  });

  test("feedback modal opens and validates", async ({ page }) => {
    await page.goto(PROFILE);
    await page.getByRole("button", { name: /Feedback/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // submit is gated until a message is typed
    const submit = dialog.getByRole("button", { name: /Send feedback/ });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel(/Details/).fill("Property crime value looks off here.");
    await expect(submit).toBeEnabled();
  });
});

test.describe("landing", () => {
  test("every plain visit shows the landing hero; explore enters the map", async ({ page }) => {
    // Seed the seen-flag like a returning user: the landing must STILL greet -
    // plain visits always land on the landing now; only stateful share URLs
    // skip straight to the map (founder decision 2026-06).
    await page.addInitScript(() => {
      try {
        localStorage.setItem("mlv-onboarded-v1", "1");
      } catch {
        /* ignore */
      }
    });
    await page.goto("/");
    await expect(
      page.getByPlaceholder("A window onto your new home")
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Explore the map" }).click();
    // Dismissal reveals the map chrome.
    await expect(
      page.getByRole("link", { name: /festra|liveable/i }).first()
    ).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("map", () => {
  // Plain "/" greets with the landing on every visit now, so the map tests
  // enter the way a user does: through the landing's explore CTA. The seeded
  // seen-flag only suppresses the lens-picker modal on deep-link entries
  // (the shared-pin test below), exactly as journeys.spec.ts does.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("mlv-onboarded-v1", "1");
      } catch {
        /* ignore */
      }
    });
  });

  /** Plain "/" -> landing -> explore CTA -> the map. */
  async function openMapViaLanding(page: Page) {
    await page.goto("/");
    const explore = page.getByRole("button", { name: "Explore the map" });
    await expect(explore).toBeVisible({ timeout: 20_000 });
    await explore.click();
  }

  test("map route loads and MapLibre paints a canvas", async ({ page }) => {
    await openMapViaLanding(page);
    await expect(page.getByRole("link", { name: /festra|liveable/i }).first()).toBeVisible();
    // The hydration question, settled empirically: does the MapLibre canvas appear?
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 25_000 });
  });

  test("suburb search returns results", async ({ page, isMobile }) => {
    await openMapViaLanding(page);
    // Below the sm breakpoint the top-bar search is hidden; search lives in
    // the bottom sheet's Search tab instead.
    if (isMobile) {
      await page.getByRole("tab", { name: "Search" }).click();
    }
    const search = page.getByPlaceholder(/search/i).filter({ visible: true }).first();
    await search.fill("Carlton");
    // search results render as a listbox / options
    await expect(
      page.getByText(/Carlton/i).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("buyer report restores from a shared pin URL", async ({ page }) => {
    // ?buyer=1&lat&lng restores the Location Check without a map click, so this
    // exercises the buyer report panel (DOM) rather than the rAF-throttled GL
    // canvas. A CBD pin always yields positives + things-to-verify.
    await page.goto("/?buyer=1&lat=-37.8136&lng=144.9631");
    // The buyer panel renders twice (desktop sidebar + mobile sheet); one copy
    // is display:none per viewport, so filter to the visible one.
    await expect(
      page.getByText(/positive signal|to verify/i).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("shows a recoverable error when area data fails to load", async ({ page }) => {
    // Simulate the data fetch failing — the map must not silently render empty.
    // (The landing still renders without area data; the alert lives on the map.)
    await page.route("**/data/places.json", (route) => route.abort());
    await openMapViaLanding(page);
    await expect(page.getByText("Could not load area data")).toBeVisible({ timeout: 15_000 });
  });
});
