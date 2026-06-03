import { describe, it, expect } from "vitest";
import { nearestAirSite, type EpaAirSite } from "../lib/epa-air";

const SITES: EpaAirSite[] = [
  { n: "Box Hill", lat: -37.8287, lon: 145.1324, b: "Good", p: "PM2.5", t: "2026-06-03T11:00:00Z" },
  { n: "Footscray", lat: -37.8, lon: 144.9, b: "Fair", p: "PM2.5", t: "2026-06-03T11:00:00Z" },
  { n: "Traralgon", lat: -38.2, lon: 146.5, b: null, p: null, t: null },
];

describe("nearestAirSite", () => {
  it("returns the closest site with its band, distance in metres", () => {
    // pin near Box Hill ([lng, lat])
    const r = nearestAirSite([145.13, -37.83], SITES);
    expect(r?.name).toBe("Box Hill");
    expect(r?.band).toBe("Good");
    expect(r?.param).toBe("PM2.5");
    expect(r!.distanceMeters).toBeLessThan(2000);
  });

  it("picks Footscray for an inner-west pin", () => {
    expect(nearestAirSite([144.9, -37.8], SITES)?.name).toBe("Footscray");
  });

  it("returns null band when the nearest site has no current reading", () => {
    const r = nearestAirSite([146.5, -38.2], SITES);
    expect(r?.name).toBe("Traralgon");
    expect(r?.band).toBeNull();
  });

  it("returns null for empty / missing input", () => {
    expect(nearestAirSite([145, -37], [])).toBeNull();
    expect(nearestAirSite([145, -37], null)).toBeNull();
  });
});
