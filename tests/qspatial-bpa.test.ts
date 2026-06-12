import { describe, it, expect } from "vitest";
import {
  albersForward,
  albersInverse,
  assembleRings,
  bpaPackForBbox,
  regionEnvelopeAlbers,
} from "../scripts/lib/qspatial-bpa";
import { getRegion } from "../lib/regions";
import type { Position } from "geojson";

describe("GDA94 Australia Albers projection", () => {
  it("round-trips Brisbane to sub-mm", () => {
    const [x, y] = albersForward(153.0, -27.5);
    const [lon, lat] = albersInverse(x, y);
    expect(lon).toBeCloseTo(153.0, 8);
    expect(lat).toBeCloseTo(-27.5, 8);
  });

  it("matches the SEQ pack's shapefile extent (sanity vs known data)", () => {
    // BPA_SouthEastQueenslandRegion_July2017.shp header bbox (Albers metres)
    // inverse-projects to lon/lat inside the catalogued SEQ envelope.
    const [lonMin, latMin] = albersInverse(1936213.07, -3245350.69);
    const [lonMax, latMax] = albersInverse(2094346.65, -2999655.55);
    expect(lonMin).toBeGreaterThan(151.0);
    expect(lonMax).toBeLessThan(154.0);
    expect(latMin).toBeGreaterThan(-29.0);
    expect(latMax).toBeLessThan(-26.0);
  });

  it("region envelope covers all forward-projected corners", () => {
    const bbox = getRegion("brisbane").bbox;
    const env = regionEnvelopeAlbers(bbox);
    for (const [lon, lat] of [
      [bbox.west, bbox.south],
      [bbox.west, bbox.north],
      [bbox.east, bbox.south],
      [bbox.east, bbox.north],
    ]) {
      const [x, y] = albersForward(lon, lat);
      expect(x).toBeGreaterThan(env.minX);
      expect(x).toBeLessThan(env.maxX);
      expect(y).toBeGreaterThan(env.minY);
      expect(y).toBeLessThan(env.maxY);
    }
  });
});

describe("bpaPackForBbox", () => {
  it("brisbane resolves to the SEQ pack", () => {
    const pack = bpaPackForBbox(getRegion("brisbane").bbox);
    expect(pack?.file).toBe("DP_SouthEastQueensland_BPA.zip");
  });

  it("a non-QLD bbox resolves to null", () => {
    expect(bpaPackForBbox(getRegion("melbourne").bbox)).toBeNull();
  });
});

describe("assembleRings (shapefile ring semantics)", () => {
  // Shapefile outer rings are CLOCKWISE.
  const cw = (w: number, s: number, e: number, n: number): Position[] => [
    [w, s],
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
  const ccw = (w: number, s: number, e: number, n: number): Position[] =>
    cw(w, s, e, n).reverse();

  it("single clockwise ring becomes a Polygon", () => {
    const g = assembleRings([cw(0, 0, 10, 10)]);
    expect(g.type).toBe("Polygon");
    expect((g as GeoJSON.Polygon).coordinates).toHaveLength(1);
  });

  it("hole is attached to its containing outer", () => {
    const g = assembleRings([cw(0, 0, 10, 10), ccw(2, 2, 4, 4)]);
    expect(g.type).toBe("Polygon");
    expect((g as GeoJSON.Polygon).coordinates).toHaveLength(2);
  });

  it("two outers become a MultiPolygon with the hole in the right one", () => {
    const g = assembleRings([
      cw(0, 0, 10, 10),
      cw(20, 0, 30, 10),
      ccw(22, 2, 24, 4),
    ]);
    expect(g.type).toBe("MultiPolygon");
    const mp = (g as GeoJSON.MultiPolygon).coordinates;
    expect(mp).toHaveLength(2);
    expect(mp.find((p) => p[0][0][0] === 20)).toHaveLength(2);
    expect(mp.find((p) => p[0][0][0] === 0)).toHaveLength(1);
  });

  it("orphan hole is promoted to an outer (no silent area loss)", () => {
    const g = assembleRings([cw(0, 0, 10, 10), ccw(20, 20, 24, 24)]);
    expect(g.type).toBe("MultiPolygon");
    expect((g as GeoJSON.MultiPolygon).coordinates).toHaveLength(2);
  });
});
