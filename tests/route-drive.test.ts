import { describe, it, expect } from "vitest";
import { parseOrsDrive } from "../lib/route-drive";

describe("parseOrsDrive", () => {
  it("extracts minutes + km from an ORS directions geojson summary", () => {
    const json = {
      features: [
        { properties: { summary: { duration: 732, distance: 8543 } }, geometry: {} },
      ],
    };
    expect(parseOrsDrive(json)).toEqual({ durationMin: 12, distanceKm: 8.5 });
  });

  it("returns null for shapes without a usable summary", () => {
    expect(parseOrsDrive(null)).toBeNull();
    expect(parseOrsDrive({})).toBeNull();
    expect(parseOrsDrive({ features: [] })).toBeNull();
    expect(parseOrsDrive({ features: [{ properties: {} }] })).toBeNull();
    expect(parseOrsDrive({ features: [{ properties: { summary: { duration: "x" } } }] })).toBeNull();
  });
});
