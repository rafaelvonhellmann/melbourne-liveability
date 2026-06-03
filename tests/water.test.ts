import { describe, it, expect } from "vitest";
import { waterRetailerAt, type WaterCorp } from "../lib/water";

/** Unit-square corp boundary covering 144..145 E, -38..-37 S. */
function corp(name: string, url?: string): WaterCorp {
  return {
    name,
    url,
    geometry: {
      type: "Polygon",
      coordinates: [[[144, -37], [145, -37], [145, -38], [144, -38], [144, -37]]],
    },
  };
}

const INSIDE: [number, number] = [144.5, -37.5];
const OUTSIDE: [number, number] = [140, -30];

describe("waterRetailerAt", () => {
  it("returns the corporation whose boundary contains the point", () => {
    const r = waterRetailerAt(INSIDE, [corp("South East Water", "https://sew")]);
    expect(r).toEqual({ name: "South East Water", url: "https://sew" });
  });
  it("returns null outside every boundary", () => {
    expect(waterRetailerAt(OUTSIDE, [corp("Yarra Valley Water")])).toBeNull();
  });
  it("returns null for empty / missing input", () => {
    expect(waterRetailerAt(INSIDE, [])).toBeNull();
    expect(waterRetailerAt(INSIDE, null)).toBeNull();
  });
  it("first containing match wins", () => {
    expect(waterRetailerAt(INSIDE, [corp("First"), corp("Second")])?.name).toBe("First");
  });
});
