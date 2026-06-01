import { test, expect } from "@playwright/test";

// A residential SA2 known to have a rich profile (population trend + crime).
const PROFILE = "/places/brunswick-east-206011106";

test.describe("content routes", () => {
  test("pricing shows the three tiers", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: "Pricing", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Area Reports" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open the map/ })).toBeVisible();
  });

  test("account page renders with export + clear", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Your data", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Export my data/ })).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();
  });

  test("privacy + terms are marked draft", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/Draft — not yet legal advice/)).toBeVisible();
    await page.goto("/terms");
    await expect(page.getByText(/Draft — not yet legal advice/)).toBeVisible();
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
});

test.describe("profile", () => {
  test("loads, switches to the Safety tab, shows the LGA crime note", async ({ page }) => {
    await page.goto(PROFILE);
    await expect(page.getByRole("heading", { name: "Brunswick East", level: 1 })).toBeVisible();
    // population trend (Overview)
    await expect(page.getByText(/Population trend/i)).toBeVisible();
    // tab switch — both crime sparklines carry the LGA note, so take the first.
    await page.getByRole("tab", { name: /Crime|Safety/ }).click();
    await expect(page.getByText(/Native LGA geography \(not SA2\)/).first()).toBeVisible();
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

test.describe("map", () => {
  test("map route loads and MapLibre paints a canvas", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /liveable/i }).first()).toBeVisible();
    // The hydration question, settled empirically: does the MapLibre canvas appear?
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 25_000 });
  });

  test("suburb search returns results", async ({ page }) => {
    await page.goto("/");
    const search = page.getByPlaceholder(/search/i).first();
    await search.fill("Carlton");
    // search results render as a listbox / options
    await expect(page.getByText(/Carlton/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows a recoverable error when area data fails to load", async ({ page }) => {
    // Simulate the data fetch failing — the map must not silently render empty.
    await page.route("**/data/places.json", (route) => route.abort());
    await page.goto("/");
    await expect(page.getByText("Could not load area data")).toBeVisible({ timeout: 15_000 });
  });
});
