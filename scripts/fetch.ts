/**
 * Downloads ABS ASGS boundaries for the active region into data/raw
 * (gitignored). Region: `--region <id>` / REGION env, default melbourne.
 * Run: npm run data:fetch [-- --region=<id>]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Feature, FeatureCollection } from "geojson";
import { fetchAbsGeoJson } from "./lib/abs-geo.js";
import { inClause, loadSa2Codes } from "./lib/melbourne-sa2-codes.js";
import {
  PIPELINE_REGION,
  sa1RawName,
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

async function fetchSa1ForRegion(): Promise<FeatureCollection> {
  const region = PIPELINE_REGION;
  try {
    console.log(`Fetching SA1 (${region.label})...`);
    return await fetchAbsGeoJson({
      layerPath: "SA1/FeatureServer/0",
      where: `GCCSA_CODE_2021='${region.gccsa}'`,
      outFields: "SA1_CODE_2021,SA2_CODE_2021,GCCSA_CODE_2021",
    });
  } catch (e) {
    console.warn(
      `SA1 GCCSA query failed (${(e as Error).message}); retrying by SA2_CODE_2021 chunks...`
    );
  }

  const codes = await loadSa2Codes(sa2RawName(region));
  const features: Feature[] = [];
  for (let i = 0; i < codes.length; i += 200) {
    const chunk = codes.slice(i, i + 200);
    console.log(
      `  SA1 fallback chunk ${Math.floor(i / 200) + 1}/${Math.ceil(codes.length / 200)} (${chunk.length} SA2)`
    );
    const fc = await fetchAbsGeoJson({
      layerPath: "SA1/FeatureServer/0",
      where: inClause(chunk, "SA2_CODE_2021"),
      outFields: "SA1_CODE_2021,SA2_CODE_2021,GCCSA_CODE_2021",
    });
    features.push(...fc.features);
  }
  return { type: "FeatureCollection", features };
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

  const sa1 = await fetchSa1ForRegion();
  await saveJson(sa1RawName(region), sa1);

  console.log(
    `Done: ${sa2.features.length} SA2, ${sa1.features.length} SA1, ${sal.features.length} SAL, ${lga.features.length} LGA`
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
