/**
 * Enriches data/generated/places.json with the ABS building-approvals pipeline
 * (place.context.developmentPipeline) from data/raw/abs-sa2-approvals.json - the
 * "what's being built" Horizon signal. Standalone mirror of the inline compute
 * in normalize.ts (which is the durable monthly-build path). Run after
 * fetch-abs-approvals; follow with data:geo. Context only, never scored.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW, GENERATED } from "./lib/paths.js";
import { readApprovalsFile } from "./lib/abs-approvals.js";
import { summarizeApprovals } from "../lib/approvals.js";
import type { Place, PlaceContext } from "../lib/types.js";

async function main() {
  const placesPath = path.join(GENERATED, "places.json");
  const { generatedAt, places } = JSON.parse(
    await readFile(placesPath, "utf8")
  ) as { generatedAt: string; places: Place[] };

  const map = await readApprovalsFile(path.join(RAW, "abs-sa2-approvals.json"));
  console.log(`Building approvals: ${map.size} SA2s`);

  let enriched = 0;
  for (const p of places) {
    const dp = summarizeApprovals(map.get(p.sa2Code));
    if (!dp) continue;
    p.context = {
      ...(p.context ?? {}),
      developmentPipeline: dp,
    } satisfies PlaceContext;
    enriched++;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(`Applied building approvals to ${enriched} places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
