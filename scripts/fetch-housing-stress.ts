/**
 * Housing-stress raw fetch: ABS 2021 Census household-stress percentages at SA2
 * (stress_172021 rent >30% of income; stress_152021 mortgage >30%). From the ABS
 * Family & community service (already used for tenure/rent). Writes a raw file so
 * the apply step (and normalize) can add context.housingStress WITHOUT a full
 * data:fetch. ABS, CC BY 4.0. Context only - never scored. See lib/housing-stress.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { loadMelbourneSa2Codes } from "./lib/melbourne-sa2-codes.js";
import { fetchArcGisTable } from "./lib/arcgis-fetch.js";
import { STRESS_SERVICE, STRESS_FIELDS } from "../lib/housing-stress.js";

async function main() {
  await mkdir(RAW, { recursive: true });
  const codes = await loadMelbourneSa2Codes();
  console.log(`Melbourne SA2 count: ${codes.length}`);
  console.log("ABS Census household stress (rent/mortgage >30% of income)...");
  const rows = await fetchArcGisTable(STRESS_SERVICE, 0, { codes, outFields: STRESS_FIELDS });
  await writeFile(path.join(RAW, "abs-sa2-stress.json"), JSON.stringify(rows));
  console.log(`  stress rows: ${rows.length}`);
  console.log("Done housing-stress fetch.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
