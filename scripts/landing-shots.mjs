// One-off: capture per-scene screenshots of the new landing against a running
// dev server (PORT env). Headless Chromium paints fine where the preview MCP's
// hidden tab cannot. Not part of any build.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const PORT = process.env.PORT || "56034";
const OUT = process.env.OUT || "C:/Users/rafae/AppData/Local/Temp/festra-landing-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGEERROR: " + String(e).slice(0, 300)));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE-ERR: " + m.text().slice(0, 300));
});

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });

// Landing should gate in for the fresh visitor (tagline lives in the search
// placeholder attribute, so target the input, not visible text).
await page.waitForSelector('input[placeholder*="window onto"]', { timeout: 30000 });
// Let the map tiles paint.
await page.waitForTimeout(6000);

const scrollH = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
console.log("scrollable px: " + scrollH);

// Scene scroll anchors: hero top, then progressive depths through the bands.
const stops = [
  ["1-hero", 0],
  ["2-pinning-mid", 0.18],
  ["2-pinning-end", 0.3],
  ["3-glimpse", 0.45],
  ["4-report", 0.6],
  ["5-compare", 0.74],
  ["6-close-band", 0.92],
  ["7-footer", 1.0],
];
for (const [name, f] of stops) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round(scrollH * f));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, quality: 55, type: "jpeg" });
  console.log("shot " + name);
}

// Mobile pass: hero + one mid scene.
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/m1-hero.jpg`, quality: 55, type: "jpeg" });
const scrollHm = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round(scrollHm * 0.45));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/m2-glimpse.jpg`, quality: 55, type: "jpeg" });
console.log("mobile shots done");

await browser.close();
console.log("DONE -> " + OUT);
