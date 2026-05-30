/**
 * Enriches data/generated/places.json with the 15-minute-access context layer
 * (place.context.walkAccess), computed straight-line from each SA2 centroid
 * against the OSM everyday-amenity extracts.
 *
 * This is the SAME computation `scripts/normalize.ts` performs inline (it uses
 * the shared `lib/walk-access.ts` helpers). It exists as a standalone step so
 * the walk-access metric can be (re)applied to already-built artifacts without
 * re-running the much heavier hazard-overlay intersection. A full
 * `npm run data:build` produces the identical field via normalize.
 *
 * Run after data:fetch (so osm-amenities.json exists). Follow with data:geo
 * (re-emits places.geojson + pct_walkaccess and copies places.json to public)
 * and data:poi (amenity pins).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW, GENERATED } from "./lib/paths.js";
import type { Place, PlaceContext } from "../lib/types.js";
import { countWithinKm } from "./lib/proximity.js";
import {
  WALK_THRESHOLD_KM,
  WALK_CATEGORY_IDS,
  classifyOsmAmenity,
  summariseWalkAccess,
  type WalkCategoryId,
} from "../lib/walk-access.js";

type OsmEl = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function osmPoints(
  data: { elements?: OsmEl[] } | null,
  filter?: (tags: Record<string, string>) => boolean
): [number, number][] {
  const pts: [number, number][] = [];
  for (const el of data?.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const tags = el.tags ?? {};
    if (filter && !filter(tags)) continue;
    pts.push([lon, lat]);
  }
  return pts;
}

async function loadJson(dir: string, file: string): Promise<{ elements?: OsmEl[] }> {
  try {
    return JSON.parse(await readFile(path.join(dir, file), "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const placesPath = path.join(GENERATED, "places.json");
  const { generatedAt, places } = JSON.parse(
    await readFile(placesPath, "utf8")
  ) as { generatedAt: string; places: Place[] };

  const amenities = await loadJson(RAW, "osm-amenities.json");
  const health = await loadJson(RAW, "osm-health.json");
  const schools = await loadJson(RAW, "osm-schools.json");

  const walkPoints: Record<WalkCategoryId, [number, number][]> = {
    supermarket: [],
    pharmacy: [],
    gp: osmPoints(health, (t) => /doctors|clinic/.test(t.amenity ?? "")),
    school: osmPoints(schools, (t) => t.amenity === "school"),
    childcare: osmPoints(schools, (t) => t.amenity === "kindergarten"),
    park: [],
    cafe_restaurant: [],
    gym_leisure: [],
  };
  for (const el of amenities.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const cat = classifyOsmAmenity(el.tags ?? {});
    if (cat && cat in walkPoints) walkPoints[cat].push([lon, lat]);
  }

  let enriched = 0;
  for (const p of places) {
    const counts = {} as Record<WalkCategoryId, number>;
    for (const id of WALK_CATEGORY_IDS) {
      counts[id] = countWithinKm(p.centroid, walkPoints[id], WALK_THRESHOLD_KM);
    }
    const walkAccess = summariseWalkAccess(counts, {
      sourceId: "osm-amenities",
      period: "current",
    });
    const ctx: PlaceContext = { ...(p.context ?? {}), walkAccess };
    p.context = ctx;
    enriched++;
  }

  await writeFile(
    placesPath,
    JSON.stringify({ generatedAt, places })
  );
  console.log(
    `Applied 15-min access to ${enriched} places ` +
      `(supermarket=${walkPoints.supermarket.length} pharmacy=${walkPoints.pharmacy.length} ` +
      `park=${walkPoints.park.length} cafe/restaurant=${walkPoints.cafe_restaurant.length} ` +
      `gym/leisure=${walkPoints.gym_leisure.length})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
