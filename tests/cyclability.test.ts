import { describe, it, expect } from "vitest";
import {
  CYCLABILITY_SATURATION_KM_PER_KM2,
  CYCLE_THRESHOLD_KM,
  CYCLE_SPEED_KMH,
  CYCLE_MINUTES,
  bikeReachKm,
  classifyCycleway,
  summariseCyclability,
} from "../lib/cyclability";
import { WALK_THRESHOLD_KM } from "../lib/walk-access";

describe("classifyCycleway", () => {
  it("classifies dedicated cycleways and bicycle-designated paths as separated", () => {
    expect(classifyCycleway({ highway: "cycleway" })).toBe("separated");
    expect(classifyCycleway({ highway: "path", bicycle: "designated" })).toBe(
      "separated"
    );
    expect(classifyCycleway({ highway: "footway", bicycle: "designated" })).toBe(
      "separated"
    );
  });

  it("classifies on-road bike lanes from cycleway=* tags", () => {
    expect(classifyCycleway({ highway: "residential", cycleway: "lane" })).toBe(
      "on_road"
    );
    expect(
      classifyCycleway({ highway: "primary", "cycleway:left": "track" })
    ).toBe("on_road");
    expect(
      classifyCycleway({ highway: "secondary", "cycleway:both": "shared_lane" })
    ).toBe("on_road");
  });

  it("returns null for non-cycling ways and empty tags", () => {
    expect(classifyCycleway({ highway: "residential" })).toBeNull();
    expect(classifyCycleway({ cycleway: "no" })).toBeNull();
    expect(classifyCycleway({})).toBeNull();
    expect(classifyCycleway(undefined)).toBeNull();
  });
});

describe("bike reach radius (buyer-pin ring)", () => {
  it("derives km from the stated speed and time", () => {
    expect(bikeReachKm(60, 14)).toBeCloseTo(14, 5);
    expect(bikeReachKm(30, 14)).toBeCloseTo(7, 5);
    expect(bikeReachKm(15, 16)).toBeCloseTo(4, 5);
  });

  it("CYCLE_THRESHOLD_KM matches the 15-min @ 14 km/h assumption", () => {
    expect(CYCLE_THRESHOLD_KM).toBeCloseTo((CYCLE_SPEED_KMH * CYCLE_MINUTES) / 60, 5);
    expect(CYCLE_THRESHOLD_KM).toBeCloseTo(3.5, 5);
  });

  it("reaches farther than the 15-min walk ring (so the rings read as concentric)", () => {
    expect(CYCLE_THRESHOLD_KM).toBeGreaterThan(WALK_THRESHOLD_KM);
  });
});

describe("summariseCyclability", () => {
  const opts = { sourceId: "osm-cycleways", period: "current" };

  it("computes density per km² and splits separated vs on-road", () => {
    const c = summariseCyclability(
      { separatedKm: 3, onRoadKm: 1, segments: 5, areaKm2: 2 },
      opts
    );
    expect(c.cyclewayKm).toBe(4);
    expect(c.separatedKm).toBe(3);
    expect(c.onRoadKm).toBe(1);
    expect(c.densityKmPerKm2).toBeCloseTo(2, 5);
    expect(c.segments).toBe(5);
    expect(c.sourceId).toBe("osm-cycleways");
  });

  it("saturates the index at 100 and is not a percentile", () => {
    const dense = summariseCyclability(
      {
        separatedKm: CYCLABILITY_SATURATION_KM_PER_KM2 * 10,
        onRoadKm: 0,
        segments: 20,
        areaKm2: 1,
      },
      opts
    );
    expect(dense.index).toBe(100);

    const half = summariseCyclability(
      {
        separatedKm: (CYCLABILITY_SATURATION_KM_PER_KM2 / 2) * 1,
        onRoadKm: 0,
        segments: 4,
        areaKm2: 1,
      },
      opts
    );
    expect(half.index).toBe(50);
  });

  it("gives a zero index when no infrastructure is mapped", () => {
    const none = summariseCyclability(
      { separatedKm: 0, onRoadKm: 0, segments: 0, areaKm2: 5 },
      opts
    );
    expect(none.cyclewayKm).toBe(0);
    expect(none.densityKmPerKm2).toBe(0);
    expect(none.index).toBe(0);
  });

  it("handles a zero-area SA2 without dividing by zero", () => {
    const c = summariseCyclability(
      { separatedKm: 2, onRoadKm: 0, segments: 1, areaKm2: 0 },
      opts
    );
    expect(c.densityKmPerKm2).toBe(0);
    expect(c.index).toBe(0);
  });
});
