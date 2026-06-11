/**
 * Downloads ABS ASGS boundaries for the active region into data/raw
 * (gitignored). Region: `--region <id>` / REGION env, default melbourne.
 * Run: npm run data:fetch [-- --region=<id>]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAbsGeoJson } from "./lib/abs-geo.js";
import {
  PIPELINE_REGION,
  sa2RawName,
  salRawName,
  lgaRawName,
} from "./lib/pipeline-region.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "..", "data", "raw");

async function saveJson(name: string, data: unknown) {
  const file = path.join(RAW_DIR, name);
  await writeFile(file, JSON.stringify(data), "utf8");
  console.log(`Wrote ${file} (${JSON.stringify(data).length} bytes)`);
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const region = PIPELINE_REGION;

  console.log(`Fetching SA2 (${region.label})...`);
  const sa2 = await fetchAbsGeoJson({
    layerPath: "SA2/FeatureServer/0",
    where: `GCCSA_CODE_2021='${region.gccsa}'`,
    outFields:
      "SA2_CODE_2021,SA2_NAME_2021,SA3_CODE_2021,SA4_CODE_2021,GCCSA_CODE_2021",
  });

  console.log(
    `Fetching SAL (${region.state} - clipped to ${region.label} SA2 envelope in crosswalk)...`
  );
  const sal = await fetchAbsGeoJson({
    layerPath: "SAL/FeatureServer/0",
    where: `STATE_CODE_2021='${region.stateCode}'`,
    outFields: "SAL_CODE_2021,SAL_NAME_2021,STATE_CODE_2021",
  });

  console.log(`Fetching LGA (${region.state})...`);
  const lga = await fetchAbsGeoJson({
    layerPath: "LGA/FeatureServer/0",
    where: `STATE_CODE_2021='${region.stateCode}'`,
    outFields: "LGA_CODE_2021,LGA_NAME_2021,STATE_CODE_2021",
  });

  await saveJson(sa2RawName(region), sa2);
  await saveJson(salRawName(region), sal);
  await saveJson(lgaRawName(region), lga);

  console.log(
    `Done: ${sa2.features.length} SA2, ${sal.features.length} SAL, ${lga.features.length} LGA`
  );
  console.log(
    "Optional: add data/raw/mb-population-2021.csv for population-weighted crosswalk (else area-weighted)."
  );

  // Child scripts re-resolve the region from env; propagate it explicitly so
  // the `--region` arg form flows through too.
  const childEnv = { ...process.env, REGION: region.id };

  console.log("\n▶ Indicator sources...");
  const { execSync } = await import("node:child_process");
  execSync("npx tsx scripts/fetch-indicators.ts", {
    stdio: "inherit",
    env: childEnv,
  });

  console.log("\n▶ Extra buyer POI (banks, TAFE/university)...");
  execSync("npx tsx scripts/fetch-extra-poi.ts", {
    stdio: "inherit",
    env: childEnv,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
