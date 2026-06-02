/**
 * Enriches data/generated/places.json with the housing-stress context layer
 * (place.context.housingStress) from ABS 2021 Census stress percentages
 * (data/raw/abs-sa2-stress.json). Same computation normalize.ts performs inline
 * (both use lib/housing-stress.ts). Standalone so the metric can be (re)applied
 * without a full fetch/score rebuild. Context only - never scored.
 *
 * Run after fetch-housing-stress. Follow with data:geo.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW, GENERATED } from "./lib/paths.js";
import { summariseHousingStress } from "../lib/housing-stress.js";
import type { Place, PlaceContext } from "../lib/types.js";

async function main() {
  const placesPath = path.join(GENERATED, "places.json");
  const { generatedAt, places } = JSON.parse(
    await readFile(placesPath, "utf8")
  ) as { generatedAt: string; places: Place[] };

  const rows = JSON.parse(
    (await readFile(path.join(RAW, "abs-sa2-stress.json"), "utf8").catch(() => "[]")) || "[]"
  ) as Record<string, string | number>[];

  const byCode = new Map<string, Record<string, string | number>>();
  for (const r of rows) byCode.set(String(r.sa2_code_2021 ?? ""), r);

  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
  let enriched = 0;
  for (const p of places) {
    const row = byCode.get(p.sa2Code);
    if (!row) continue;
    const hs = summariseHousingStress(
      { rentStress: num(row.stress_172021), mortgageStress: num(row.stress_152021) },
      { sourceId: "abs-census-community-2021", period: "2021" }
    );
    if (hs.rentStressPct == null && hs.mortgageStressPct == null) continue;
    const ctx: PlaceContext = { ...(p.context ?? {}), housingStress: hs };
    p.context = ctx;
    enriched++;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(`Applied housing stress to ${enriched} places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
