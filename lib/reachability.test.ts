import { describe, it, expect } from "vitest";
import type { Polygon, MultiPolygon } from "geojson";
import {
  reachProfile,
  valhallaCosting,
  REACH_MINUTES,
  isReachabilityConfigured,
  parseOrsIsochrone,
} from "./reachability";

// Unit square 0..1 with a hole 0.4..0.6 (same fixture style as buyer-location).
const square: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    [
      [0.4, 0.4],
      [0.4, 0.6],
      [0.6, 0.6],
      [0.6, 0.4],
      [0.4, 0.4],
    ],
  ],
};

describe("parseOrsIsochrone", () => {
  it("extracts a Polygon geometry from an ORS FeatureCollection", () => {
    const ors = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { value: 900, group_index: 0 },
          geometry: square,
        },
      ],
    };
    expect(parseOrsIsochrone(ors)).toEqual(square);
  });

  it("extracts a MultiPolygon too", () => {
    const mp: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [square.coordinates],
    };
    const ors = { type: "FeatureCollection", features: [{ geometry: mp }] };
    expect(parseOrsIsochrone(ors)?.type).toBe("MultiPolygon");
  });

  it("returns null for missing / empty / malformed shapes", () => {
    expect(parseOrsIsochrone(null)).toBeNull();
    expect(parseOrsIsochrone({})).toBeNull();
    expect(parseOrsIsochrone({ features: [] })).toBeNull();
    expect(parseOrsIsochrone({ features: [{ geometry: { type: "Point", coordinates: [0, 0] } }] })).toBeNull();
  });
});

describe("reachability", () => {
  it("maps each mode to its ORS profile", () => {
    expect(reachProfile("drive")).toBe("driving-car");
    expect(reachProfile("walk")).toBe("foot-walking");
  });

  it("maps each mode to its Valhalla costing", () => {
    expect(valhallaCosting("drive")).toBe("auto");
    expect(valhallaCosting("walk")).toBe("pedestrian");
  });

  it("offers sensible per-mode time budgets (walk tops out lower)", () => {
    expect(REACH_MINUTES.drive).toEqual([15, 30, 45]);
    expect(REACH_MINUTES.walk).toEqual([10, 20, 30]);
    expect(Math.max(...REACH_MINUTES.walk)).toBeLessThan(Math.max(...REACH_MINUTES.drive));
  });

  it("is always available thanks to the keyless Valhalla default", () => {
    // No NEXT_PUBLIC_ORS_API_KEY in the test env, yet the feature is on.
    expect(isReachabilityConfigured()).toBe(true);
  });
});
