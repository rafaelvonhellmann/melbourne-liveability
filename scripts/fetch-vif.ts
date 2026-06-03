/**
 * Victoria in Future 2023 (VIF2023) SA2 population + dwelling projections to 2036
 * (DTP, CC BY 4.0) - the core of the forward-looking "Horizon" lens. The XLSX
 * sits behind the planning.vic WAF (blocks Node/undici by TLS fingerprint), so we
 * download via gov-fetch (undici -> curl fallback). Writes data/raw/vif2023-sa2.xlsx.
 * Run `npm run data:apply-vif` after, then `data:geo`. Context only, never scored;
 * a PROJECTION (smallest VIF geography is SA2), NOT a forecast or target.
 */
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { downloadToFile } from "./lib/gov-fetch.js";

const VIF_URL =
  "https://www.planning.vic.gov.au/__data/assets/excel_doc/0028/691660/VIF2023_SA2_Pop_Hhold_Dwelling_Projections_to_2036_Release_2.xlsx";

async function main() {
  const dest = path.join(RAW, "vif2023-sa2.xlsx");
  console.log("Victoria in Future 2023 SA2 projections (planning.vic, via gov-fetch)...");
  await downloadToFile(VIF_URL, dest);
  console.log(`Wrote ${dest}`);
  console.log("fetch-vif complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
