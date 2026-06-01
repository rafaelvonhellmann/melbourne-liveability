import { describe, expect, it } from "vitest";
import type { Feature, FeatureCollection, Point } from "geojson";
import {
  haversineKm,
  pointInPolygon,
  findSa2ForPoint,
  amenitiesNear,
} from "@/lib/buyer-location";

const square = {
  type: "Polygon" as const,
  // unit square 0..1 with a hole 0.4..0.6
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

function poi(pinType: string, lng: number, lat: number): Feature<Point> {
  return {
    type: "Feature",
    properties: { pinType },
    geometry: { type: "Point", coordinates: [lng, lat] },
  };
}

describe("haversineKm", () => {
  it("≈1.11 km per 0.01° of latitude", () => {
    expect(haversineKm([144, -37], [144, -37.01])).toBeCloseTo(1.11, 1);
  });
  it("is zero for the same point", () => {
    expect(haversineKm([144.9, -37.8], [144.9, -37.8])).toBe(0);
  });
});

describe("pointInPolygon", () => {
  it("inside the ring", () => {
    expect(pointInPolygon([0.2, 0.2], square)).toBe(true);
  });
  it("outside the ring", () => {
    expect(pointInPolygon([2, 2], square)).toBe(false);
  });
  it("inside a hole counts as outside", () => {
    expect(pointInPolygon([0.5, 0.5], square)).toBe(false);
  });
});

describe("findSa2ForPoint", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { sa2Code: "206011106", slug: "brunswick-east", name: "Brunswick East" },
        geometry: square,
      },
    ],
  };
  it("returns the containing SA2", () => {
    expect(findSa2ForPoint([0.2, 0.2], fc)?.name).toBe("Brunswick East");
  });
  it("returns null when outside every polygon", () => {
    expect(findSa2ForPoint([9, 9], fc)).toBeNull();
  });
});

describe("amenitiesNear", () => {
  it("groups POIs within the radius by pinType with count + nearest", () => {
    const pin: [number, number] = [144, -37];
    const pois = [
      poi("gp", 144.001, -37), // ~0.09 km
      poi("gp", 144, -37.005), // ~0.55 km
      poi("school", 144, -37.5), // ~55 km — excluded
    ];
    const byCat = amenitiesNear(pin, pois, 1.2);
    expect(byCat.get("gp")?.count).toBe(2);
    expect(byCat.get("gp")?.nearestKm).toBeLessThan(0.2);
    expect(byCat.has("school")).toBe(false);
  });
});
