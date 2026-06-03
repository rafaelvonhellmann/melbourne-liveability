import type { WalkAccess } from "./types";

/**
 * "15-minute access" walkability helpers (context-only, never scored).
 *
 * Inspired by Melbourne's "20-minute neighbourhood" and Paris's "15-minute
 * city" programs. We measure whether everyday amenities are reachable on foot
 * from each SA2's population-weighted centroid using straight-line distance.
 *
 * Honesty note: straight-line ("as the crow flies") distance overstates real
 * walking access versus a street-network walk; rivers, freeways and rail lines
 * are not subtracted. OSM amenity coverage is community-maintained and uneven.
 * This is a transparency/compilation feature, not a routing engine - see the
 * methodology caveat. Nothing here enters the composite score or its weights.
 */

/** ~15 min on foot at 5 km/h. */
export const WALK_THRESHOLD_KM = 1.2;

export type WalkCategoryId =
  | "supermarket"
  | "pharmacy"
  | "gp"
  | "school"
  | "childcare"
  | "park"
  | "cafe_restaurant"
  | "gym_leisure";

export type WalkCategory = {
  id: WalkCategoryId;
  label: string;
};

/** The N key everyday-amenity categories used for the access summary. */
export const WALK_CATEGORIES: WalkCategory[] = [
  { id: "supermarket", label: "Supermarket / grocery" },
  { id: "pharmacy", label: "Pharmacy" },
  { id: "gp", label: "GP / clinic" },
  { id: "school", label: "School" },
  { id: "childcare", label: "Childcare / kinder" },
  { id: "park", label: "Park / open space" },
  { id: "cafe_restaurant", label: "Cafe / restaurant" },
  { id: "gym_leisure", label: "Gym / leisure centre" },
];

export const WALK_CATEGORY_IDS: WalkCategoryId[] = WALK_CATEGORIES.map(
  (c) => c.id
);

/**
 * Map a raw OSM tag set to one of the everyday-amenity categories that the
 * dedicated amenities Overpass extract covers (supermarket, pharmacy, park,
 * cafe/restaurant, gym/leisure). GP / school / childcare are classified from
 * the existing health and schools extracts in the pipeline.
 */
export function classifyOsmAmenity(
  tags: Record<string, string>
): WalkCategoryId | null {
  const shop = tags.shop ?? "";
  const amenity = tags.amenity ?? "";
  const leisure = tags.leisure ?? "";

  if (shop === "supermarket" || shop === "convenience" || shop === "greengrocer") {
    return "supermarket";
  }
  if (amenity === "pharmacy" || shop === "chemist") return "pharmacy";
  if (leisure === "park" || leisure === "garden") return "park";
  if (amenity === "cafe" || amenity === "restaurant" || amenity === "fast_food") {
    return "cafe_restaurant";
  }
  if (
    leisure === "fitness_centre" ||
    leisure === "sports_centre" ||
    amenity === "gym"
  ) {
    return "gym_leisure";
  }
  return null;
}

/**
 * Compute the 15-minute-walk access summary for one SA2 from category POI
 * counts already filtered to within {@link WALK_THRESHOLD_KM}.
 *
 * `walkabilityIndex` is a coarse 0–100 context measure: 70% category coverage
 * (how many of the key everyday categories are reachable) + 30% a saturating
 * amenity-density term. It is deliberately NOT a percentile and NOT scored.
 */
export function summariseWalkAccess(
  categoryCounts: Record<WalkCategoryId, number>,
  opts: { sourceId: string; period: string; thresholdKm?: number }
): WalkAccess {
  const ids = WALK_CATEGORY_IDS;
  const total = ids.length;
  let reachable = 0;
  let totalPois = 0;
  const categories: Record<string, number> = {};
  for (const id of ids) {
    const n = categoryCounts[id] ?? 0;
    categories[id] = n;
    totalPois += n;
    if (n > 0) reachable++;
  }

  const coverage = total > 0 ? reachable / total : 0;
  // Saturating density: 16+ everyday POIs within reach ≈ "fully walkable".
  const density = Math.min(1, totalPois / 16);
  const walkabilityIndex = Math.round((0.7 * coverage + 0.3 * density) * 100);

  return {
    thresholdKm: opts.thresholdKm ?? WALK_THRESHOLD_KM,
    categories,
    reachable,
    total,
    accessPct: total > 0 ? Math.round((reachable / total) * 1000) / 10 : 0,
    walkabilityIndex,
    sourceId: opts.sourceId,
    period: opts.period,
  };
}
