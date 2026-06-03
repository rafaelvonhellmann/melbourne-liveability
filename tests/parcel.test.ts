import { describe, it, expect } from "vitest";
import { bboxAround, pickParcelArea } from "../lib/parcel";
import type { FeatureCollection } from "geojson";

describe("bboxAround", () => {
  it("returns [south, west, north, east] straddling the point", () => {
    const [s, w, n, e] = bboxAround(144.96, -37.81, 40);
    expect(s).toBeLessThan(-37.81);
    expect(n).toBeGreaterThan(-37.81);
    expect(w).toBeLessThan(144.96);
    expect(e).toBeGreaterThan(144.96);
    // ~40 m is well under 0.001 deg
    expect(n - s).toBeLessThan(0.002);
  });
});

const fc = (coords: number[][][], props: Record<string, unknown> = {}): FeatureCollection => ({
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: coords } }],
});

describe("pickParcelArea", () => {
  // ~ a small inner-city block around the pin
  const block = [[[144.9595, -37.8105], [144.9605, -37.8105], [144.9605, -37.8095], [144.9595, -37.8095], [144.9595, -37.8105]]];

  it("returns area (m2) + lot/plan for the containing parcel", () => {
    const r = pickParcelArea([144.96, -37.81], fc(block, { parcel_lot_number: "1", parcel_plan_number: "TP12345" }));
    expect(r).not.toBeNull();
    expect(r!.areaM2).toBeGreaterThan(5000); // ~0.001x0.001 deg block is ~1 ha
    expect(r!.lot).toBe("1");
    expect(r!.plan).toBe("TP12345");
  });

  it("returns null when the point is outside the parcel", () => {
    expect(pickParcelArea([145.5, -37.5], fc(block))).toBeNull();
  });

  it("returns null for an empty collection", () => {
    expect(pickParcelArea([144.96, -37.81], { type: "FeatureCollection", features: [] })).toBeNull();
    expect(pickParcelArea([144.96, -37.81], null)).toBeNull();
  });
});
