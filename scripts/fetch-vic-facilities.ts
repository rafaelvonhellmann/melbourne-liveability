/**
 * Authoritative VIC point facilities to replace sparse OSM map pins (G5b):
 *   - police stations  (Vicmap Emergency Services FOI)
 *   - child-care centres (Vicmap Features of Interest)
 * Both Vicmap / DTP Victoria, CC BY 4.0. Writes raw files so build-poi can emit
 * authoritative `police` + `childcare` pins WITHOUT a full data:fetch. Context
 * pins only - never scored. Run `npm run data:poi` after.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { fetchVicPoliceStations, fetchVicChildcare } from "./lib/vic-facilities.js";

async function main() {
  await mkdir(RAW, { recursive: true });

  console.log("Vicmap police stations...");
  const police = await fetchVicPoliceStations();
  await writeFile(path.join(RAW, "vic-police.json"), JSON.stringify(police));
  console.log(`  police: ${police.length}`);

  console.log("Vicmap child-care centres...");
  const childcare = await fetchVicChildcare();
  await writeFile(path.join(RAW, "vic-childcare.json"), JSON.stringify(childcare));
  console.log(`  childcare: ${childcare.length}`);

  console.log("Done VIC facilities fetch.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
