import { describe, it, expect } from "vitest";
import {
  WALK_THRESHOLD_KM,
  WALK_CATEGORY_IDS,
  classifyOsmAmenity,
  summariseWalkAccess,
  type WalkCategoryId,
} from "../lib/walk-access";

function counts(partial: Partial<Record<WalkCategoryId, number>>) {
  const out = {} as Record<WalkCategoryId, number>;
  for (const id of WALK_CATEGORY_IDS) out[id] = partial[id] ?? 0;
  return out;
}

describe("classifyOsmAmenity", () => {
  it("maps OSM tags to walk categories", () => {
    expect(classifyOsmAmenity({ shop: "supermarket" })).toBe("supermarket");
    expect(classifyOsmAmenity({ shop: "convenience" })).toBe("supermarket");
    expect(classifyOsmAmenity({ amenity: "pharmacy" })).toBe("pharmacy");
    expect(classifyOsmAmenity({ leisure: "park" })).toBe("park");
    expect(classifyOsmAmenity({ amenity: "cafe" })).toBe("cafe_restaurant");
    expect(classifyOsmAmenity({ amenity: "restaurant" })).toBe("cafe_restaurant");
    expect(classifyOsmAmenity({ leisure: "fitness_centre" })).toBe("gym_leisure");
  });

  it("returns null for unrelated tags", () => {
    expect(classifyOsmAmenity({ amenity: "bench" })).toBeNull();
    expect(classifyOsmAmenity({})).toBeNull();
  });
});

describe("summariseWalkAccess", () => {
  const opts = { sourceId: "osm-amenities", period: "current" };

  it("counts reachable categories and reports an availability summary, not a percentile", () => {
    const wa = summariseWalkAccess(
      counts({ supermarket: 2, pharmacy: 1, park: 3 }),
      opts
    );
    expect(wa.total).toBe(WALK_CATEGORY_IDS.length);
    expect(wa.reachable).toBe(3);
    // accessPct is reachable/total*100 (3/8 = 37.5), an availability share.
    expect(wa.accessPct).toBeCloseTo(37.5, 1);
    expect(wa.thresholdKm).toBe(WALK_THRESHOLD_KM);
    expect(wa.categories.supermarket).toBe(2);
    expect(wa.categories.gp).toBe(0);
  });

  it("gives 100% access and a high walkability index when all categories present", () => {
    const all = counts(
      Object.fromEntries(WALK_CATEGORY_IDS.map((id) => [id, 3]))
    );
    const wa = summariseWalkAccess(all, opts);
    expect(wa.reachable).toBe(wa.total);
    expect(wa.accessPct).toBe(100);
    expect(wa.walkabilityIndex).toBeGreaterThanOrEqual(90);
    expect(wa.walkabilityIndex).toBeLessThanOrEqual(100);
  });

  it("gives zero access when nothing is reachable", () => {
    const wa = summariseWalkAccess(counts({}), opts);
    expect(wa.reachable).toBe(0);
    expect(wa.accessPct).toBe(0);
    expect(wa.walkabilityIndex).toBe(0);
  });
});
