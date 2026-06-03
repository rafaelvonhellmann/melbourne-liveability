/**
 * Social-housing SUPPLY raw fetch: ABS 2021 Census G37 (Tenure and Landlord Type
 * by Dwelling Structure) at SA2 - the State/Territory housing authority + community
 * housing provider totals + the grand total. Writes a new raw file so the apply
 * step (and normalize) can add the context.socialHousing field WITHOUT a full
 * data:fetch. ABS, CC BY 4.0. Context only - never scored. See lib/social-housing.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { loadMelbourneSa2Codes } from "./lib/melbourne-sa2-codes.js";
import { fetchArcGisTable } from "./lib/arcgis-fetch.js";
import { G37_SERVICE, G37_FIELDS } from "../lib/social-housing.js";

async function main() {
  await mkdir(RAW, { recursive: true });
  const codes = await loadMelbourneSa2Codes();
  console.log(`Melbourne SA2 count: ${codes.length}`);
  console.log("ABS Census G37 (tenure + landlord type) social-housing supply...");
  const rows = await fetchArcGisTable(G37_SERVICE, 0, { codes, outFields: G37_FIELDS });
  await writeFile(path.join(RAW, "abs-sa2-landlord.json"), JSON.stringify(rows));
  console.log(`  G37 rows: ${rows.length}`);
  console.log("Done social-housing fetch.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
