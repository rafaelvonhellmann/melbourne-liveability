// Downscale the landing shots to 560px-wide base64 JPEGs for chat embedding.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const DIR = "C:/Users/rafae/AppData/Local/Temp/festra-landing-shots";
const names = ["1-hero", "2-pinning-end", "3-glimpse", "4-report", "5-compare", "7-footer"];

const browser = await chromium.launch();
const page = await browser.newPage();
const out = {};
for (const n of names) {
  const b64 = readFileSync(`${DIR}/${n}.jpg`).toString("base64");
  out[n] = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = "data:image/jpeg;base64," + src;
    await img.decode();
    const w = 560, h = Math.round((img.height / img.width) * w);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.5);
  }, b64);
}
await browser.close();
writeFileSync(`${DIR}/thumbs.json`, JSON.stringify(out));
console.log("sizes KB: " + Object.entries(out).map(([k, v]) => k + "=" + Math.round(v.length / 1024)).join(" "));
