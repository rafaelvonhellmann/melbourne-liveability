import { describe, it, expect } from "vitest";
import { busiestRoadNear, type TrafficSegment } from "../lib/traffic";

// A short E-W segment near the CBD; ~111 m per 0.001 deg lat.
function seg(road: string, v: number, h: number, lat: number): TrafficSegment {
  return { r: road, v, h, c: [[144.96, lat], [144.97, lat]] };
}

const PIN: [number, number] = [144.965, -37.81];

describe("busiestRoadNear", () => {
  it("returns the highest-AADT road within the radius", () => {
    const segs = [
      seg("Quiet St", 3000, 1, -37.8102), // ~22 m away (0.0002 deg lat)
      seg("Big Rd", 40000, 9, -37.8103), // ~33 m away, busier
    ];
    const r = busiestRoadNear(PIN, segs, 250);
    expect(r?.road).toBe("Big Rd");
    expect(r?.aadt).toBe(40000);
    expect(r?.heavyPct).toBe(9);
    expect(r!.distanceMeters).toBeLessThan(60);
  });

  it("returns null when no segment is within the radius", () => {
    const far = seg("Far Rd", 50000, 5, -37.9); // ~10 km south
    expect(busiestRoadNear(PIN, [far], 250)).toBeNull();
  });

  it("prefers the busier road even if a quieter one is marginally closer", () => {
    const segs = [
      seg("Closer Quiet", 2000, 1, -37.8101), // ~11 m
      seg("Farther Busy", 60000, 12, -37.812), // ~22 m
    ];
    expect(busiestRoadNear(PIN, segs, 250)?.road).toBe("Farther Busy");
  });

  it("handles empty / malformed input", () => {
    expect(busiestRoadNear(PIN, [])).toBeNull();
    expect(busiestRoadNear(PIN, [{ r: "x", v: NaN, h: 0, c: [] }])).toBeNull();
  });
});
