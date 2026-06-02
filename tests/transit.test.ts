import { describe, it, expect } from "vitest";
import { nearestStation, type Station } from "../lib/transit";

const STATIONS: Station[] = [
  { name: "Near", coord: [144.97, -37.8] },
  { name: "Far", coord: [145.05, -37.85] },
];

describe("nearestStation", () => {
  it("returns the closest station with a rounded metre distance", () => {
    const r = nearestStation([144.97, -37.8], STATIONS);
    expect(r?.name).toBe("Near");
    expect(r?.distanceM).toBeLessThanOrEqual(2);
  });

  it("picks the nearer of several", () => {
    const r = nearestStation([145.04, -37.85], STATIONS);
    expect(r?.name).toBe("Far");
  });

  it("measures a real distance (~560 m for ~0.005deg lat)", () => {
    const r = nearestStation([144.97, -37.795], STATIONS);
    expect(r?.name).toBe("Near");
    expect(r?.distanceM).toBeGreaterThan(450);
    expect(r?.distanceM).toBeLessThan(650);
  });

  it("returns null for an empty list", () => {
    expect(nearestStation([144.97, -37.8], [])).toBeNull();
  });
});
