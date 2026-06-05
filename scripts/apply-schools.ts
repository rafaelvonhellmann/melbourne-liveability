/**
 * Enriches data/generated/places.json with the school sector mix
 * (place.context.schools = {government, catholic, independent}) from
 * data/raw/vic-schools-by-sa2.json. Standalone mirror of the inline compute in
 * normalize.ts. Run after fetch-schools; follow with data:geo. Context only.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW, GENERATED } from "./lib/paths.js";
import type { Place, PlaceContext } from "../lib/types.js";
import type { SchoolMix } from "./fetch-schools.js";

type SchoolsFile = { period: string; places: Record<string, SchoolMix> };

async function main() {
  const placesPath = path.join(GENERATED, "places.json");
  const { generatedAt, places } = JSON.parse(
    await readFile(placesPath, "utf8")
  ) as { generatedAt: string; places: Place[] };

  const sf = JSON.parse(
    await readFile(path.join(RAW, "vic-schools-by-sa2.json"), "utf8")
  ) as SchoolsFile;

  let enriched = 0;
  for (const p of places) {
    const m = sf.places[p.sa2Code];
    if (!m || m.government + m.catholic + m.independent === 0) continue;
    p.context = {
      ...(p.context ?? {}),
      schools: {
        government: m.government,
        catholic: m.catholic,
        independent: m.independent,
        sourceId: "vic-doe-school-locations",
        period: sf.period,
      },
    } satisfies PlaceContext;
    enriched++;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(`Applied school mix to ${enriched} places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
