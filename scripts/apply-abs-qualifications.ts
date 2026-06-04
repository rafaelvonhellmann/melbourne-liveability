/**
 * Enriches data/generated/places.json with post-school qualification context
 * (place.context.community.bachelorPlusPct / postgradPct) from
 * data/raw/abs-sa2-qualifications.json. Standalone mirror of the inline compute
 * in normalize.ts (the durable build path). Run after fetch-abs-qualifications;
 * follow with data:geo to copy into public/. Context only, never scored.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW, GENERATED } from "./lib/paths.js";
import { readQualificationsFile } from "./lib/abs-qualifications.js";
import type { Place, PlaceContext } from "../lib/types.js";

async function main() {
  const placesPath = path.join(GENERATED, "places.json");
  const { generatedAt, places } = JSON.parse(
    await readFile(placesPath, "utf8")
  ) as { generatedAt: string; places: Place[] };

  const map = await readQualificationsFile(path.join(RAW, "abs-sa2-qualifications.json"));
  console.log(`Qualifications: ${map.size} SA2s`);

  let enriched = 0;
  for (const p of places) {
    const q = map.get(p.sa2Code);
    if (!q || q.bachelorPlusPct == null) continue;
    const existing = p.context?.community;
    const community = {
      renterPct: existing?.renterPct ?? null,
      apartmentPct: existing?.apartmentPct ?? null,
      firstNationsPct: existing?.firstNationsPct ?? null,
      ...(existing?.year12Pct != null ? { year12Pct: existing.year12Pct } : {}),
      bachelorPlusPct: q.bachelorPlusPct,
      postgradPct: q.postgradPct,
      qualSourceId: "abs-census-g49-sa2",
      sourceId: existing?.sourceId ?? "abs-census-community-2021",
      period: existing?.period ?? "2021",
    };
    p.context = { ...(p.context ?? {}), community } satisfies PlaceContext;
    enriched++;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(`Applied qualifications to ${enriched} places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
