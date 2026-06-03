import { describe, it, expect } from "vitest";
import { zoneSchoolAt, resolveSchoolZones, type SchoolZoneFeature } from "../lib/school-zones";

/** A unit square zone in lon/lat for `school`, covering 144..145 E, -38..-37 S. */
function squareZone(school: string): SchoolZoneFeature {
  return {
    type: "Feature",
    properties: { s: school },
    geometry: {
      type: "Polygon",
      coordinates: [[[144, -37], [145, -37], [145, -38], [144, -38], [144, -37]]],
    },
  };
}

const INSIDE = { lat: -37.5, lng: 144.5 };
const OUTSIDE = { lat: -30, lng: 140 };

describe("zoneSchoolAt", () => {
  it("returns the school whose zone contains the point", () => {
    expect(zoneSchoolAt(INSIDE, [squareZone("Test Primary School")])).toBe("Test Primary School");
  });
  it("returns null when the point is outside every zone", () => {
    expect(zoneSchoolAt(OUTSIDE, [squareZone("Test Primary School")])).toBeNull();
  });
  it("returns null for an empty or missing feature list", () => {
    expect(zoneSchoolAt(INSIDE, [])).toBeNull();
    expect(zoneSchoolAt(INSIDE, null)).toBeNull();
  });
  it("picks the first matching zone when zones overlap", () => {
    expect(zoneSchoolAt(INSIDE, [squareZone("First"), squareZone("Second")])).toBe("First");
  });
});

describe("resolveSchoolZones", () => {
  it("resolves primary + secondary independently", () => {
    const data = {
      year: 2026,
      primary: [squareZone("Inner Primary")],
      secondary: [squareZone("Inner Secondary")],
    };
    expect(resolveSchoolZones(INSIDE, data)).toEqual({
      primary: "Inner Primary",
      secondary: "Inner Secondary",
    });
  });
  it("returns nulls outside all zones", () => {
    const data = { primary: [squareZone("P")], secondary: [squareZone("S")] };
    expect(resolveSchoolZones(OUTSIDE, data)).toEqual({ primary: null, secondary: null });
  });
  it("handles missing data", () => {
    expect(resolveSchoolZones(INSIDE, null)).toEqual({ primary: null, secondary: null });
  });
});
