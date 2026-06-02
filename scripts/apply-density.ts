/**
 * Enriches data/generated/places.json with resident population + density
 * (place.context.population), from ABS ERP (data/raw/abs-sa2-erp.json) and the
 * SA2 land area already carried on context.cyclability.areaKm2.
 *
 * Same computation normalize.ts performs inline (both use lib/population.ts).
 * Standalone so it can be (re)applied without a full rebuild. Context only,
 * never scored. Run after data:fetch; follow with data:geo to copy to public.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW, GENERATED } from "./lib/paths.js";
import { populationContext } from "../lib/population.js";
import type { Place, PlaceContext } from "../lib/types.js";

async function main() {
  const placesPath = path.join(GENERATED, "places.json");
  const { generatedAt, places } = JSON.parse(await readFile(placesPath, "utf8")) as {
    generatedAt: string;
    places: Place[];
  };

  const erp = JSON.parse(
    (await readFile(path.join(RAW, "abs-sa2-erp.json"), "utf8").catch(() => "[]")) || "[]"
  ) as Record<string, string | number>[];
  const popByCode = new Map<string, number>();
  for (const r of erp) {
    const code = String(r.sa2_code_2021 ?? "");
    const v = Number(r.erp_no_2023);
    if (code && Number.isFinite(v)) popByCode.set(code, v);
  }

  let enriched = 0;
  for (const p of places) {
    const count = popByCode.get(p.sa2Code) ?? null;
    const area = p.context?.cyclability?.areaKm2 ?? null;
    if (count == null && area == null) continue;
    const pop = populationContext(count, area, { sourceId: "abs-erp-sa2", period: "2023" });
    p.context = { ...(p.context ?? {}), population: pop } as PlaceContext;
    enriched++;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(`Applied population/density to ${enriched} places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
