import { describe, it, expect } from "vitest";
import {
  nearestNoiseSources,
  noiseFlags,
  noiseKindLabel,
  NOISE_THRESHOLDS_M,
  type NoiseLine,
} from "../lib/noise";

// A roughly east-west rail line at lat -37.8000, spanning lng 144.95..145.05.
const RAIL: NoiseLine = {
  kind: "rail",
  coords: [
    [144.95, -37.8],
    [145.0, -37.8],
    [145.05, -37.8],
  ],
};
// A freeway ~ along lng 145.00, lat -37.81..-37.79.
const FREEWAY: NoiseLine = {
  kind: "freeway",
  coords: [
    [145.0, -37.81],
    [145.0, -37.79],
  ],
};

describe("nearestNoiseSources", () => {
  it("measures ~0 m when the pin sits on the line", () => {
    const d = nearestNoiseSources([145.0, -37.8], [RAIL]);
    expect(d.rail).toBeLessThanOrEqual(2);
    expect(d.tram).toBeNull();
    expect(d.freeway).toBeNull();
  });

  it("measures the perpendicular distance to a line, not just its vertices", () => {
    // Pin due south of the rail line's MIDDLE (between vertices) by ~0.0018 deg
    // lat (~200 m). Distance must reflect the segment, not the nearer endpoint.
    const d = nearestNoiseSources([144.975, -37.8018], [RAIL]);
    expect(d.rail).toBeGreaterThan(150);
    expect(d.rail).toBeLessThan(260);
  });

  it("keeps the nearest of each kind independently", () => {
    const d = nearestNoiseSources([145.0, -37.8], [RAIL, FREEWAY]);
    expect(d.rail).toBeLessThanOrEqual(2);
    expect(d.freeway).toBeLessThanOrEqual(2);
  });

  it("returns null for a kind with no lines", () => {
    const d = nearestNoiseSources([145.0, -37.8], [FREEWAY]);
    expect(d.rail).toBeNull();
    expect(d.tram).toBeNull();
    expect(d.freeway).not.toBeNull();
  });
});

describe("noiseFlags", () => {
  it("flags only kinds within their threshold, closest first", () => {
    const flags = noiseFlags({ rail: 40, tram: 200, freeway: 120 });
    expect(flags.map((f) => f.kind)).toEqual(["rail", "freeway"]); // tram 200 > 50
  });

  it("respects per-kind thresholds (tram is stricter)", () => {
    expect(noiseFlags({ rail: null, tram: 60, freeway: null })).toHaveLength(0); // 60 > 50
    expect(noiseFlags({ rail: null, tram: 50, freeway: null })).toHaveLength(1); // 50 == threshold
    expect(NOISE_THRESHOLDS_M.tram).toBe(50);
  });

  it("returns nothing when all sources are far or absent", () => {
    expect(noiseFlags({ rail: 999, tram: null, freeway: 999 })).toEqual([]);
  });
});

describe("noiseKindLabel", () => {
  it("gives a plain-English label", () => {
    expect(noiseKindLabel("rail")).toBe("railway line");
    expect(noiseKindLabel("freeway")).toBe("freeway / major road");
  });
});
