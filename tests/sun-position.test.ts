import { describe, it, expect } from "vitest";
import { sunPosition } from "../lib/sun";

// Melbourne CBD.
const LAT = -37.8136;
const LNG = 144.9631;

describe("sunPosition", () => {
  it("puts the summer midday sun high and in the northern half of the sky", () => {
    // ~Melbourne solar noon on the December (S-hemisphere summer) solstice.
    const p = sunPosition(new Date("2026-12-21T02:00:00Z"), LAT, LNG);
    expect(p.altitudeDeg).toBeGreaterThan(60); // high summer sun (~75 deg max)
    expect(p.azimuthDeg >= 300 || p.azimuthDeg <= 90).toBe(true); // northern half
  });

  it("gives a much lower midday sun in winter", () => {
    const p = sunPosition(new Date("2026-06-21T02:00:00Z"), LAT, LNG);
    expect(p.altitudeDeg).toBeGreaterThan(15);
    expect(p.altitudeDeg).toBeLessThan(40); // ~29 deg at winter solstice noon
  });

  it("puts the sun below the horizon at local midnight", () => {
    const p = sunPosition(new Date("2026-12-21T14:00:00Z"), LAT, LNG); // ~01:00 Melbourne
    expect(p.altitudeDeg).toBeLessThan(0);
  });

  it("returns a bounded azimuth", () => {
    const p = sunPosition(new Date("2026-03-21T22:00:00Z"), LAT, LNG);
    expect(p.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(p.azimuthDeg).toBeLessThan(360);
  });
});
