// What does the landing hero look like under prefers-reduced-motion, and does
// the camera still pose per scene? Compares against the default-motion run.
import { chromium } from "@playwright/test";
const PORT = process.env.PORT || "3000";
const browser = await chromium.launch();

for (const reduced of [false, true]) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('input[placeholder*="window onto"]', { timeout: 30000 });
  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => ({
    canvas: document.querySelectorAll("canvas").length,
    fallback: !!document.querySelector('[data-testid="landing-map-fallback"]'),
  }));
  const scrollH = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round(scrollH * 0.3));
  await page.waitForTimeout(1500);
  const cam = await page.screenshot({ path: `C:/Users/rafae/AppData/Local/Temp/festra-landing-shots/rm-${reduced}.jpg`, quality: 50, type: "jpeg" });
  console.log(`reduced=${reduced}: canvas=${state.canvas} fallback=${state.fallback} shot=${cam.length}b`);
  await ctx.close();
}
await browser.close();
console.log("DONE");
