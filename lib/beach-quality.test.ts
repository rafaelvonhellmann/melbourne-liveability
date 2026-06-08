import { describe, it, expect } from "vitest";
import { haversineKm, nearestBeach, type Beach } from "./beach-quality";

const beaches: Beach[] = [
  { name: "St Kilda", lng: 144.974, lat: -37.868, grade: "Fair", value: 74, n: 30, date: "2025-12-21" },
  { name: "Brighton", lng: 144.984, lat: -37.918, grade: "Good", value: 15, n: 30, date: "2025-12-21" },
];

describe("beach-quality", () => {
  it("haversineKm is ~0 for the same point and grows with distance", () => {
    expect(haversineKm([144.974, -37.868], [144.974, -37.868])).toBeCloseTo(0, 5);
    expect(haversineKm([144.974, -37.868], [144.984, -37.918])).toBeGreaterThan(4);
  });

  it("picks the nearest beach within range", () => {
    const r = nearestBeach(beaches, [144.97, -37.87], 6);
    expect(r?.name).toBe("St Kilda");
    expect(r && r.distanceKm < 1).toBe(true);
  });

  it("returns null when no beach is within range (inland)", () => {
    expect(nearestBeach(beaches, [145.3, -37.8], 6)).toBeNull();
  });
});
