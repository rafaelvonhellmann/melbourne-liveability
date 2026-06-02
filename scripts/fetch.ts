/**
 * Downloads ABS ASGS boundaries for Greater Melbourne into data/raw (gitignored).
 * Run: npm run data:fetch
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAbsGeoJson } from "./lib/abs-geo.js";
import { GREATER_MELBOURNE_GCCSA } from "../lib/crosswalk-types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "..", "data", "raw");

async function saveJson(name: string, data: unknown) {
  const file = path.join(RAW_DIR, name);
  await writeFile(file, JSON.stringify(data), "utf8");
  console.log(`Wrote ${file} (${JSON.stringify(data).length} bytes)`);
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  console.log("Fetching SA2 (Greater Melbourne)...");
  const sa2 = await fetchAbsGeoJson({
    layerPath: "SA2/FeatureServer/0",
    where: `GCCSA_CODE_2021='${GREATER_MELBOURNE_GCCSA}'`,
    outFields:
      "SA2_CODE_2021,SA2_NAME_2021,SA3_CODE_2021,SA4_CODE_2021,GCCSA_CODE_2021",
  });

  console.log("Fetching SAL (Victoria — clipped to Melbourne SA2 envelope in crosswalk)...");
  const sal = await fetchAbsGeoJson({
    layerPath: "SAL/FeatureServer/0",
    where: "STATE_CODE_2021='2'",
    outFields: "SAL_CODE_2021,SAL_NAME_2021,STATE_CODE_2021",
  });

  console.log("Fetching LGA (Victoria)...");
  const lga = await fetchAbsGeoJson({
    layerPath: "LGA/FeatureServer/0",
    where: "STATE_CODE_2021='2'",
    outFields: "LGA_CODE_2021,LGA_NAME_2021,STATE_CODE_2021",
  });

  await saveJson("sa2-melbourne.geojson", sa2);
  await saveJson("sal-vic.geojson", sal);
  await saveJson("lga-vic.geojson", lga);

  console.log(
    `Done: ${sa2.features.length} SA2, ${sal.features.length} SAL, ${lga.features.length} LGA`
  );
  console.log(
    "Optional: add data/raw/mb-population-2021.csv for population-weighted crosswalk (else area-weighted)."
  );

  console.log("\n▶ Indicator sources...");
  const { execSync } = await import("node:child_process");
  execSync("npx tsx scripts/fetch-indicators.ts", { stdio: "inherit" });

  console.log("\n▶ Extra buyer POI (banks, TAFE/university)...");
  execSync("npx tsx scripts/fetch-extra-poi.ts", { stdio: "inherit" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
