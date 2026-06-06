import { describe, it, expect } from "vitest";
import { parseOrsDrive, parseValhallaRoute, isDriveRoutingConfigured } from "../lib/route-drive";

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

describe("parseValhallaRoute", () => {
  it("extracts minutes + km from a Valhalla trip summary (time s, length km)", () => {
    const json = { trip: { summary: { time: 559.244, length: 2.9 } } };
    expect(parseValhallaRoute(json)).toEqual({ durationMin: 9, distanceKm: 2.9 });
  });

  it("returns null for shapes without a usable summary", () => {
    expect(parseValhallaRoute(null)).toBeNull();
    expect(parseValhallaRoute({})).toBeNull();
    expect(parseValhallaRoute({ trip: {} })).toBeNull();
    expect(parseValhallaRoute({ trip: { summary: { time: "x", length: 1 } } })).toBeNull();
  });
});

describe("isDriveRoutingConfigured", () => {
  it("is always available thanks to the keyless Valhalla default", () => {
    expect(isDriveRoutingConfigured()).toBe(true);
  });
});
