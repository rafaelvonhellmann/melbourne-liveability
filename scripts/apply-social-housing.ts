/**
 * Enriches data/generated/places.json with the social-housing supply context
 * layer (place.context.socialHousing), from the ABS 2021 Census G37 landlord-type
 * totals (data/raw/abs-sa2-landlord.json).
 *
 * This is the SAME computation scripts/normalize.ts performs inline (both use
 * lib/social-housing.ts). It exists as a standalone step so the metric can be
 * (re)applied to already-built artifacts without a full data:fetch / score
 * rebuild. Context only — never scored.
 *
 * Run after fetch-social-housing (so abs-sa2-landlord.json exists). Follow with
 * data:geo (re-emits places.geojson and copies places.json to public).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW, GENERATED } from "./lib/paths.js";
import { computeSocialHousing } from "../lib/social-housing.js";
import type { Place, PlaceContext } from "../lib/types.js";

async function main() {
  const placesPath = path.join(GENERATED, "places.json");
  const { generatedAt, places } = JSON.parse(
    await readFile(placesPath, "utf8")
  ) as { generatedAt: string; places: Place[] };

  const rows = JSON.parse(
    (await readFile(path.join(RAW, "abs-sa2-landlord.json"), "utf8").catch(
      () => "[]"
    )) || "[]"
  ) as Record<string, string | number>[];

  const byCode = new Map<string, Record<string, string | number>>();
  for (const r of rows) byCode.set(String(r.sa2_code_2021 ?? ""), r);

  let enriched = 0;
  for (const p of places) {
    const row = byCode.get(p.sa2Code);
    if (!row) continue;
    const sh = computeSocialHousing(
      {
        stateAuthority: Number(row.r_st_h_auth_total),
        communityProvider: Number(row.r_com_hp_total),
        totalDwellings: Number(row.total_total),
      },
      { sourceId: "abs-census-community-2021", period: "2021" }
    );
    if (sh.socialPct == null && sh.dwellings == null) continue;
    const ctx: PlaceContext = { ...(p.context ?? {}), socialHousing: sh };
    p.context = ctx;
    enriched++;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(`Applied social-housing supply to ${enriched} places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
